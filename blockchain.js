const SHA256 = require('crypto-js/sha256')
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

class Transaction {
    constructor({ txId = '', sender = '', receiver = '', recordedAmount = 0, timestamp = new Date().toISOString(), data = { items: [], total: 0 }, signerAddress = '' }) {
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
        this.signature = '';
    }

    calculateHash(){
        return SHA256(this.txId + this.sender + this.receiver + this.recordedAmount + this.timestamp + JSON.stringify(this.data) + this.signerAddress).toString();
    }

    signTransaction(signingKey){
        if(signingKey.getPublic('hex') !== this.signerAddress){
            throw new Error('You cannot sign transactions for other wallet.')
        }

        const hashTx = this.calculateHash();
        const sig = signingKey.sign(hashTx, 'base64');
        this.signature = sig.toDER('hex');
    }

    isValid(){
        if(this.signerAddress === null){
            return true;
        }
        if(!this.signature || this.signature.length === 0){
            throw new Error('No signature in this transaction.');
        }

        const publicKey = ec.keyFromPublic(this.signerAddress, 'hex');
        return publicKey.verify(this.calculateHash(), this.signature);
    }
}

class Block {
    constructor(timestamps, transactions, previousHash = '') {
        this.timestamps = timestamps;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
        this.nonce = 0;
    }

    calculateHash() {
        return SHA256(this.previousHash + this.timestamps + JSON.stringify(this.transactions) + this.nonce).toString()
    }

    mineBlock(difficulty) {
        while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join('0')) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
        console.log('Block mined: ' + this.hash);
        console.log('Nonce: ' + this.nonce);
    }

    hasValidTransactions(){
        for(const tx of this.transactions) {
            if(!tx.isValid()){
                return false;
            }
        }

        return true;
    }
}

class Blockchain {
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
        let block = new Block(Date.now(), this.pendingTransactions, this.getLatestBlock().hash);
        block.mineBlock(this.difficulty);

        console.log('Block successfully mined!');
        this.chain.push(block);

        // Temporary: disable miner reward transaction recording so blocks only contain customer-to-cafe transactions.
        // this.pendingTransactions = [new Transaction({
        //     txId: this.createTxId(),
        //     sender: 'SYSTEM',
        //     receiver: miningRewardAddress,
        //     recordedAmount: this.miningRewards,
        //     data: { items: [], total: this.miningRewards },
        //     signerAddress: null,
        // })];
        this.pendingTransactions = [];

    }

    addTransactions(transaction) {
        if(!transaction.txId){
            transaction.txId = this.createTxId();
        }

        if(!transaction.sender || !transaction.receiver){
            throw new Error('Transaction must include sender and receiver.');
        }

        if(!transaction.isValid()){
            throw new Error('Cannot add invalid transaction into the chain.');
        }

        this.pendingTransactions.push(transaction);
    }

    getBalanceOfAddress(address) {
        let balance = 0;

        for (const block of this.chain) {
            for (const trans of block.transactions) {
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

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if(!currentBlock.hasValidTransactions()){
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

}

module.exports.Blockchain = Blockchain;
module.exports.Transaction = Transaction;

