import SHA256 from 'crypto-js/sha256.js';
import elliptic from 'elliptic';

const { ec: EC } = elliptic;
const ec = new EC('secp256k1');

export class Transaction {
  constructor({
    txId = '',
    sender = '',
    receiver = '',
    recordedAmount = 0,
    timestamp = new Date().toISOString(),
    data = { items: [], total: 0 },
    signerAddress = '',
    transactionType = 'PAYMENT',
  }) {
    this.txId = txId;
    this.sender = sender;
    this.receiver = receiver;
    this.recordedAmount = recordedAmount;
    this.timestamp = timestamp;
    this.data = {
      items: Array.isArray(data?.items) ? data.items : [],
      total: Number(data?.total ?? 0),
    };
    this.signerAddress = signerAddress;
    this.transactionType = transactionType;
    this.signature = '';
  }

  calculateHash() {
    return SHA256(
      `${this.txId}${this.sender}${this.receiver}${this.recordedAmount}${this.timestamp}${JSON.stringify(this.data)}${this.signerAddress}`
    ).toString();
  }

  signTransaction(signingKey) {
    if (signingKey.getPublic('hex') !== this.signerAddress) {
      throw new Error('You cannot sign transactions for another wallet.');
    }

    const hashTx = this.calculateHash();
    const sig = signingKey.sign(hashTx, 'base64');
    this.signature = sig.toDER('hex');
  }

  isValid() {
    if (this.signerAddress === null) {
      return true;
    }

    if (!this.signature || this.signature.length === 0) {
      throw new Error('No signature in this transaction.');
    }

    const publicKey = ec.keyFromPublic(this.signerAddress, 'hex');
    return publicKey.verify(this.calculateHash(), this.signature);
  }
}

export class Block {
  constructor(timestamp, transactions, previousHash = '') {
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
    this.minerAddress = '';
  }

  calculateHash() {
    return SHA256(`${this.previousHash}${this.timestamp}${JSON.stringify(this.transactions)}${this.nonce}`).toString();
  }

  mineBlock(difficulty) {
    while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join('0')) {
      this.nonce += 1;
      this.hash = this.calculateHash();
    }
  }

  hasValidTransactions() {
    if (!Array.isArray(this.transactions)) {
      return true;
    }

    for (const tx of this.transactions) {
      if (!tx.isValid()) {
        return false;
      }
    }

    return true;
  }
}

export class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.difficulty = 2;
    this.pendingTransactions = [];
    this.miningRewards = 100;
    this.txCounter = 1;
  }

  createGenesisBlock() {
    return new Block('04/04/2026', 'Genesis Block', '0');
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  createTxId() {
    const txId = `tx_${String(this.txCounter).padStart(3, '0')}`;
    this.txCounter += 1;
    return txId;
  }

  minePendingTransactions(miningRewardAddress) {
    const block = new Block(Date.now(), [...this.pendingTransactions], this.getLatestBlock().hash);
    block.minerAddress = miningRewardAddress;
    block.mineBlock(this.difficulty);
    this.chain.push(block);

    this.pendingTransactions = [
      new Transaction({
        txId: this.createTxId(),
        sender: 'SYSTEM',
        receiver: miningRewardAddress,
        recordedAmount: this.miningRewards,
        data: { items: [], total: this.miningRewards },
        signerAddress: null,
        transactionType: 'MINING_REWARD',
      }),
    ];
  }

  addTransactions(transaction) {
    if (!transaction.txId) {
      transaction.txId = this.createTxId();
    }

    if (!transaction.sender || !transaction.receiver) {
      throw new Error('Transaction must include sender and receiver.');
    }

    if (!transaction.isValid()) {
      throw new Error('Cannot add invalid transaction into the chain.');
    }

    const txInstance = transaction instanceof Transaction
      ? transaction
      : new Transaction(transaction);
    this.pendingTransactions.push(txInstance);
  }

  getBalanceOfAddress(address) {
    let balance = 0;

    for (const block of this.chain) {
      if (!Array.isArray(block.transactions)) {
        continue;
      }

      for (const trans of block.transactions) {
        if (trans.transactionType === 'MINING_REWARD') {
          continue;
        }

        const txTotal = Number(trans?.data?.total ?? trans?.recordedAmount ?? 0);

        if (trans.sender === address) {
          balance -= txTotal;
        }
        if (trans.receiver === address) {
          balance += txTotal;
        }
      }
    }

    return balance;
  }

  getBlocksMinedByAddress(address) {
    let count = 0;

    for (const block of this.chain) {
      if (block.minerAddress === address) {
        count += 1;
      }
    }

    return count;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i += 1) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (!currentBlock.hasValidTransactions()) {
        return false;
      }

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }

    return true;
  }

  static fromData(data) {
    const blockchain = new Blockchain();
    blockchain.difficulty = data?.difficulty ?? blockchain.difficulty;
    blockchain.miningRewards = data?.miningRewards ?? blockchain.miningRewards;
    blockchain.txCounter = data?.txCounter ?? blockchain.txCounter;

    blockchain.chain = (data?.chain ?? []).map((rawBlock) => {
      const block = new Block(
        rawBlock.timestamp ?? rawBlock.timestamps,
        Array.isArray(rawBlock.transactions)
          ? rawBlock.transactions.map((rawTx) => new Transaction(rawTx))
          : rawBlock.transactions,
        rawBlock.previousHash ?? ''
      );
      block.nonce = rawBlock.nonce ?? 0;
      block.hash = rawBlock.hash ?? block.calculateHash();
      block.minerAddress = rawBlock.minerAddress ?? '';
      return block;
    });

    blockchain.pendingTransactions = (data?.pendingTransactions ?? []).map(
      (rawTx) => new Transaction(rawTx)
    );

    if (!blockchain.chain.length) {
      blockchain.chain = [blockchain.createGenesisBlock()];
    }

    return blockchain;
  }

  replaceChain(candidateData) {
    const incoming = Blockchain.fromData(candidateData);
    if (incoming.chain.length <= this.chain.length) {
      return false;
    }

    if (!incoming.isChainValid()) {
      return false;
    }

    this.chain = incoming.chain;
    this.pendingTransactions = incoming.pendingTransactions;
    this.difficulty = incoming.difficulty;
    this.miningRewards = incoming.miningRewards;
    this.txCounter = incoming.txCounter;
    return true;
  }
}

export function generateWallet(privateKeyHex) {
  const key = ec.keyFromPrivate(privateKeyHex);
  return {
    key,
    publicAddress: key.getPublic('hex'),
  };
}

