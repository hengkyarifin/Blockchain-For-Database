import http from 'node:http';
import { URL } from 'node:url';
import { Blockchain, Transaction, generateWallet } from './src/blockchain.js';

const args = process.argv.slice(2);
const portArgIndex = args.indexOf('--port');
const port = portArgIndex >= 0 ? Number(args[portArgIndex + 1]) : 3001;
const nodeName = process.env.NODE_NAME || `node-${port}`;

const blockchain = new Blockchain();
const peers = new Set();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }
  return response.json();
}

async function broadcast(path, payload) {
  const jobs = [...peers].map(async (peer) => {
    try {
      await fetchJson(`${peer}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      // Ignore peer failures in this minimal implementation.
    }
  });
  await Promise.all(jobs);
}

async function syncFromPeers() {
  const jobs = [...peers].map(async (peer) => {
    try {
      const data = await fetchJson(`${peer}/chain`);
      blockchain.replaceChain(data.chainState);
    } catch (_) {
      // Ignore peer failures in this minimal implementation.
    }
  });
  await Promise.all(jobs);
}

function sanitizePeer(input) {
  try {
    const normalized = new URL(input);
    normalized.pathname = '';
    normalized.search = '';
    normalized.hash = '';
    return normalized.toString().replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(res, 200, { ok: true, nodeName, port });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/chain') {
    sendJson(res, 200, {
      nodeName,
      peers: [...peers],
      chainState: blockchain,
    });
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/peers') {
    sendJson(res, 200, { peers: [...peers] });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/peer') {
    const body = await readBody(req);
    const peer = sanitizePeer(body.peer);
    if (!peer) {
      sendJson(res, 400, { error: 'Invalid peer URL.' });
      return;
    }
    peers.add(peer);
    await syncFromPeers();
    sendJson(res, 200, { peers: [...peers] });
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/transaction') {
    try {
      const body = await readBody(req);
      const wallet = generateWallet(body.fromPrivateKey?.trim());
      const tx = new Transaction({
        txId: blockchain.createTxId(),
        sender: body.sender?.trim(),
        receiver: body.receiver?.trim(),
        recordedAmount: Number(body.recordedAmount ?? body.data?.total ?? 0),
        timestamp: body.timestamp || new Date().toISOString(),
        data: body.data ?? { items: [], total: 0 },
        signerAddress: wallet.publicAddress,
        transactionType: 'PAYMENT',
      });
      tx.signTransaction(wallet.key);
      blockchain.addTransactions(tx);
      await broadcast('/transaction/sync', tx);
      sendJson(res, 200, { message: 'Transaction added.', pending: blockchain.pendingTransactions.length });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/transaction/sync') {
    try {
      const body = await readBody(req);
      blockchain.addTransactions(new Transaction(body));
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/mine') {
    try {
      const body = await readBody(req);
      const minerAddress = body.minerAddress?.trim();
      if (!minerAddress) {
        throw new Error('minerAddress is required.');
      }
      blockchain.minePendingTransactions(minerAddress);
      await broadcast('/chain/sync', blockchain);
      sendJson(res, 200, {
        message: 'Block mined.',
        blocks: blockchain.chain.length,
        pending: blockchain.pendingTransactions.length,
      });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/chain/sync') {
    try {
      const body = await readBody(req);
      const accepted = blockchain.replaceChain(body);
      sendJson(res, 200, { accepted, blocks: blockchain.chain.length });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/address') {
    const address = requestUrl.searchParams.get('value')?.trim() || '';
    if (!address) {
      sendJson(res, 400, { error: 'value query is required.' });
      return;
    }
    sendJson(res, 200, {
      address,
      balance: blockchain.getBalanceOfAddress(address),
      blocksMined: blockchain.getBlocksMinedByAddress(address),
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, () => {
  console.log(`Node ${nodeName} listening on http://localhost:${port}`);
});
