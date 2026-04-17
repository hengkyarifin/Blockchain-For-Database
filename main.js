const {Blockchain, Transaction} = require('./blockchain');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

const myKey = ec.keyFromPrivate('6e9d2771b85cf67ba9a7a9e86ef4438ee5fa8affa91d0b524a06beb4f2b209f7');
const myWalletAddress = myKey.getPublic('hex');

let kyyCoin = new Blockchain();

const tx1 = new Transaction({
  sender: 'Hengky',
  receiver: 'CafeA',
  recordedAmount: 50000,
  timestamp: '2026-04-15T10:30:00',
  data: {
    items: [
      { name: 'Coffee', price: 20000, qty: 1 },
      { name: 'Sandwich', price: 30000, qty: 1 },
    ],
    total: 50000,
  },
  signerAddress: myWalletAddress,
});
tx1.signTransaction(myKey);
kyyCoin.addTransactions(tx1); 

console.log('\nStarting the miner.')
kyyCoin.minePendingTransactions(myWalletAddress)

console.log('Balance of hengky: ' + kyyCoin.getBalanceOfAddress(myWalletAddress));

// kyyCoin.chain[1].transactions[0].amount = 1;

console.log('Is chain valid? ' + kyyCoin.isChainValid())
