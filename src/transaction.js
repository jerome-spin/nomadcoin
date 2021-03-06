const CryptoJS = require('crypto-js'),
  EC = require('elliptic').ec,
  utils = require('./utils');

const ec = new EC('secp256k1');

const COINBASE_AMOUNT = 50;

class TxOut {
  constructor(address, amount) {
    this.address = address;
    this.amount = amount;
  }
}

class TxIn {
  // uTxOutId
  // uTxOutIndex
  // Signature
}

class Transaction {
  // ID
  // txIns[]
  // txOuts[]
}

class UTxOut {
  constructor(txOutId, txOutIndex, address, amount) {
    this.txOutId = txOutId;
    this.txOutIndex = txOutIndex;
    this.address = address;
    this.amount = amount;
  }
}

let uTxOuts = [];

const getTxId = tx => {
  const txInContent = tx.txIns
    .map(txIn => txIn.txOutId + txIn.txOutIndex)
    .reduce((a, b) => a + b, '');

  const txOutContent = tx.txOuts
    .map(txOut => txOut.address + txOut.amount)
    .reduce((a, b) => a + b, '');

  return CryptoJS.SHA256(txInContent + txOutContent).toString();
};

const findUTxOut = (txOutId, txOutIndex, uTxOutList) => {
  return uTxOutList.find(
    uTxO => uTxO.txOutId === txOutId && uTxO.txOutIndex === txOutIndex
  );
};

const signTxIn = (tx, txInIndex, privateKey, uTxOut) => {
  const txIn = tx.txIns[txInIndex];
  const dataToSign = tx.id;
  const { txOutId, txOutIndex } = txIn;
  const referencedUTxOut = findUTxOut(txOutId, txOutIndex, uTxOuts);
  if (referencedUTxOut === null) {
    return;
  }

  const key = ec.keyFromPrivate(privateKey, 'hex');
  const signature = utils.toHexString(key.sign(dataToSign).toDER());
  return signature;
};

const updateUTxOuts = (newTxs, uTxOutList) => {
  const newUTxOuts = newTxs
    .map(tx => {
      tx.txOuts.map((txOut, index) => {
        new UTxOut(tx.id, index, txOut.address, txOut.amount);
      });
    })
    .reduce((a, b) => a.concat(b), []);

  const spentTxOuts = newTxs
    .map(tx => tx.txIns)
    .reduce((a, b) => a.concat(b), [])
    .map(txIn => new UTxOut(txIn.txOutId, txIn.txOutIndex, '', 0));

  const resultingUTxOuts = uTxOutList
    .filter(uTxO => !findUTxOut(uTxO.txOutId, uTxO.txOutIndex, spentTxOuts))
    .concat(newUTxOuts);

  return resultingUTxOuts;
};

const isTxInStructureValid = txIn => {
  if (txIn === null) {
    return false;
  } else if (typeof txIn.signature !== 'string') {
    return false;
  } else if (typeof txIn.txOutId !== 'string') {
    return false;
  } else if (typeof txIn.txOutIndex !== 'number') {
    return false;
  } else {
    return true;
  }
};

const isAddressValid = address => {
  if (address.length !== 130) {
    console.log('The length of Public key is not valid');
    return false;
  } else if (address.match('^[a-fA-F0-9]+') === null) {
    console.log('This is not hexadecimal patterns');
    return false;
  } else if (!address.startsWith('04')) {
    console.log('The Public key is not valid');
    return false;
  } else {
    return true;
  }
};

const isTxOutStructureValid = txOut => {
  if (txOut === null) {
    return false;
  } else if (typeof txOut.address !== 'string') {
    return false;
  } else if (!isAddressValid(txOut.addres)) {
    return false;
  } else if (typeof txOut.amount !== 'number') {
    return false;
  } else {
    return true;
  }
};

const isTxStructureValid = tx => {
  if (typeof tx.id !== 'string') {
    console.log('Tx ID is not valid');
    return false;
  } else if (!(tx.txIns instanceof Array)) {
    console.log('The txIns are not an array');
    return false;
  } else if (
    !tx.txIns.map(isTxInStructureValid).reduce((a, b) => a && b, true)
  ) {
    console.log('The structure of one of the txIn is not valid');
    return false;
  } else if (!(tx.txOuts instanceof Array)) {
    console.log('The txOuts are not an array');
    return false;
  } else if (
    !tx.txOuts.map(isTxOutStructureValid).reduce((a, b) => a && b, true)
  ) {
    console.log('The structure of one of the txOut is not valid');
    return false;
  } else {
    return true;
  }
};

const validateTxIn = (txIn, tx, uTxOutList) => {
  const wantedTxOut = uTxOutList.find(
    uTxO => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex
  );
  if (wantedTxOut === null) {
    return false;
  } else {
    const address = wantedTxOut.address;
    const key = ec.keyFromPublic(address, 'hex');
    return key.verify(tx.id, txIn.signature);
  }
};

const getAmountInTxIn = (txIn, uTxOutList) =>
  findUTxOut(txIn.txOutId, txIn.txOutIndex, uTxOutList).amount;

const validateTx = (tx, uTxOutList) => {
  if (!isTxStructureValid(tx)) {
    return false;
  }

  if (getTxId(tx) !== tx.id) {
    return false;
  }

  const hasValidTxIns = tx.txIns.map(txIn =>
    validateTxIn(txIn, tx, uTxOutList)
  );

  if (!hasValidTxIns) {
    return false;
  }

  const amountInTxIns = tx.txIns
    .map(txIn => getAmountInTxIn(txIn, uTxOutList))
    .reduce((a, b) => a + b, 0);
  const amountInTxOuts = tx.txOuts
    .map(txOut => txOut.amount)
    .reduce((a, b) => a + b, 0);

  if (amountInTxIns !== amountInTxOuts) {
    return false;
  } else {
    return true;
  }
};

const validateCoinbaseTx = (tx, blockIndex) => {
  if (getTxId(tx) != tx.id) {
    console.log('Invalid Coinbase tx ID');
    return false;
  } else if (tx.txIns.length !== 1) {
    console.log('Coinbase Tx should only have one input');
    return false;
  } else if (tx.txIns[0].txOutIndex !== blockIndex) {
    console.log(
      'The txOutIndex of the Coinbase Tx should be the same as the Block Index'
    );
    return false;
  } else if (tx.txOuts.length !== 1) {
    console.log('Coinbase Tx should only have one input');
    return false;
  } else if (tx.txOuts[0].amount !== COINBASE_AMOUNT) {
    console.log(
      `Coinbase Tx should have an amount of only ${COINBASE_AMOUNT} and it has ${
        tx.txOuts[0].amount
      }`
    );
    return false;
  } else {
    return true;
  }
};
