import { useMemo, useState } from 'react';
import { Blockchain, Transaction, generateWallet } from './blockchain';
import { catalog, getSortedCompanyNames } from './catalog';

const defaultPrivateKey = '6e9d2771b85cf67ba9a7a9e86ef4438ee5fa8affa91d0b524a06beb4f2b209f7';
const defaultItemLine = { category: '', itemName: '', qty: 1 };

function formatTs(ts) {
  if (typeof ts === 'number') {
    return new Date(ts).toLocaleString();
  }
  return ts;
}

function getAddressTransactions(chain, address) {
  const matches = [];
  const normalized = address.trim();

  if (!normalized) {
    return matches;
  }

  chain.chain.forEach((block, blockIndex) => {
    if (!Array.isArray(block.transactions)) {
      return;
    }

    block.transactions.forEach((tx) => {
      if (tx.sender === normalized || tx.receiver === normalized) {
        matches.push({
          blockIndex,
          blockHash: block.hash,
          timestamp: block.timestamp ?? block.timestamps,
          tx,
        });
      }
    });
  });

  return matches;
}

const pages = ['explorer', 'transaction', 'mine', 'address', 'admin'];

export default function App() {
  const [page, setPage] = useState('explorer');
  const [chain, setChain] = useState(() => new Blockchain());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [txForm, setTxForm] = useState({
    fromPrivateKey: defaultPrivateKey,
    sender: 'Hengky',
    receiver: '',
    itemLines: [],
  });
  const [mineAddress, setMineAddress] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [hashQuery, setHashQuery] = useState('');
  const [adminForm, setAdminForm] = useState({
    difficulty: '2',
    reward: '100',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const blockOptions = useMemo(
    () => chain.chain.map((_, idx) => ({ index: idx, label: `Block #${idx}` })),
    [chain]
  );

  const latestIndex = chain.chain.length - 1;
  const viewedBlock = chain.chain[selectedIndex] ?? chain.getLatestBlock();

  const foundAddressTransactions = useMemo(
    () => getAddressTransactions(chain, addressQuery),
    [chain, addressQuery]
  );

  const searchedBalance = useMemo(() => {
    const normalized = addressQuery.trim();
    if (!normalized) {
      return null;
    }
    return chain.getBalanceOfAddress(normalized);
  }, [chain, addressQuery]);

  const searchedBlocksMined = useMemo(() => {
    const normalized = addressQuery.trim();
    if (!normalized) {
      return null;
    }
    return chain.getBlocksMinedByAddress(normalized);
  }, [chain, addressQuery]);

  const companyOptions = useMemo(() => getSortedCompanyNames(), []);

  const selectedCompany = useMemo(
    () => catalog.companies.find((company) => company.name === txForm.receiver) ?? null,
    [txForm.receiver]
  );

  const menuByCategory = useMemo(() => {
    if (!selectedCompany) {
      return {};
    }

    return selectedCompany.categories.reduce((acc, category) => {
      acc[category.name] = category.items;
      return acc;
    }, {});
  }, [selectedCompany]);

  const categoryNames = useMemo(() => Object.keys(menuByCategory), [menuByCategory]);

  const allMenuItems = useMemo(
    () =>
      Object.entries(menuByCategory).flatMap(([category, items]) =>
        items.map((item) => ({ ...item, category }))
      ),
    [menuByCategory]
  );

  function refreshChain() {
    setChain(Object.assign(Object.create(Object.getPrototypeOf(chain)), chain));
  }

  function clearStatus() {
    setMessage('');
    setError('');
  }

  function selectLatest() {
    setSelectedIndex(latestIndex);
  }

  function onSelectBlock(event) {
    setSelectedIndex(Number(event.target.value));
  }

  function updateTxField(field, value) {
    setTxForm((prev) => {
      if (field === 'receiver') {
        return {
          ...prev,
          receiver: value,
          itemLines: [],
        };
      }

      return { ...prev, [field]: value };
    });
  }

  function addTransaction(event) {
    event.preventDefault();
    clearStatus();

    try {
      const wallet = generateWallet(txForm.fromPrivateKey.trim());
      if (!txForm.receiver.trim()) {
        throw new Error('Please choose a cafe/company first.');
      }

      const mergedByName = new Map();
      txForm.itemLines.forEach((line) => {
        const menuItem = allMenuItems.find(
          (item) => item.name === line.itemName && item.category === line.category
        );
        const qty = Number(line.qty ?? 0);
        if (!menuItem || !Number.isFinite(qty) || qty <= 0) {
          return;
        }

        const existing = mergedByName.get(menuItem.name);
        if (existing) {
          existing.qty += qty;
          return;
        }

        mergedByName.set(menuItem.name, {
          name: menuItem.name,
          price: menuItem.price,
          qty,
        });
      });
      const items = Array.from(mergedByName.values());

      if (items.length === 0) {
        throw new Error('Please select at least one item quantity.');
      }

      const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const tx = new Transaction({
        txId: chain.createTxId(),
        sender: txForm.sender.trim(),
        receiver: txForm.receiver.trim(),
        recordedAmount: total,
        timestamp: new Date().toISOString(),
        data: {
          items,
          total,
        },
        signerAddress: wallet.publicAddress,
      });
      tx.signTransaction(wallet.key);
      chain.addTransactions(tx);
      refreshChain();
      setTxForm((prev) => ({
        ...prev,
        itemLines: [],
      }));
      setMessage('Transaction added to pending transactions. Mine to include it in a block.');
      setPage('mine');
    } catch (err) {
      setError(err.message);
    }
  }

  function mineNow(event) {
    event.preventDefault();
    clearStatus();

    try {
      const rewardAddress = mineAddress.trim();
      if (!rewardAddress) {
        throw new Error('Please enter a mining reward address.');
      }

      chain.minePendingTransactions(rewardAddress);
      refreshChain();
      setSelectedIndex(chain.chain.length - 1);
      setPage('explorer');
      setMessage('New block mined successfully. Latest block view is updated.');
    } catch (err) {
      setError(err.message);
    }
  }

  function trackBlockByHash(event) {
    event.preventDefault();
    clearStatus();

    const normalized = hashQuery.trim();
    if (!normalized) {
      setError('Please enter a block hash to search.');
      return;
    }

    const blockIndex = chain.chain.findIndex((block) => block.hash === normalized);
    if (blockIndex === -1) {
      setError('Block hash not found.');
      return;
    }

    setSelectedIndex(blockIndex);
    setMessage(`Block found. Jumped to Block #${blockIndex}.`);
  }

  function jumpToBlock(index) {
    setSelectedIndex(index);
    setPage('explorer');
    clearStatus();
    setMessage(`Viewing Block #${index}.`);
  }

  function updateAdminField(field, value) {
    setAdminForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateItemLine(index, field, value) {
    setTxForm((prev) => ({
      ...prev,
      itemLines: prev.itemLines.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        if (field === 'qty') {
          return {
            ...line,
            qty: Math.max(0, Number(value || 0)),
          };
        }

        if (field === 'category') {
          return {
            ...line,
            category: value,
            itemName: '',
          };
        }

        return {
          ...line,
          [field]: value,
        };
      }),
    }));
  }

  function addItemLine() {
    if (!categoryNames.length) {
      return;
    }

    setTxForm((prev) => ({
      ...prev,
      itemLines: [
        ...prev.itemLines,
        {
          ...defaultItemLine,
          category: categoryNames[0],
        },
      ],
    }));
  }

  function removeItemLine(index) {
    setTxForm((prev) => ({
      ...prev,
      itemLines: prev.itemLines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  const previewTotal = txForm.itemLines.reduce((sum, line) => {
    const menuItem = allMenuItems.find(
      (item) => item.name === line.itemName && item.category === line.category
    );
    const qty = Number(line.qty ?? 0);
    if (!menuItem || !Number.isFinite(qty) || qty <= 0) {
      return sum;
    }

    return sum + menuItem.price * qty;
  }, 0);

  function applyAdminSettings(event) {
    event.preventDefault();
    clearStatus();

    const newDifficulty = Number(adminForm.difficulty);
    const newReward = Number(adminForm.reward);

    if (!Number.isInteger(newDifficulty) || newDifficulty < 1) {
      setError('Difficulty must be an integer >= 1.');
      return;
    }

    if (!Number.isFinite(newReward) || newReward <= 0) {
      setError('Mining reward must be a number greater than 0.');
      return;
    }

    chain.difficulty = newDifficulty;
    chain.miningRewards = newReward;
    refreshChain();
    setMessage('Admin settings updated. New blocks will use the new difficulty and reward.');
  }

  const transactions = Array.isArray(viewedBlock?.transactions) ? viewedBlock.transactions : [];

  function navLabel(navPage) {
    if (navPage === 'explorer') return 'Explorer';
    if (navPage === 'transaction') return 'Add Transaction';
    if (navPage === 'mine') return 'Mine Block';
    if (navPage === 'address') return 'Search Address';
    return 'Admin';
  }

  return (
    <div className="app">
      <h1>Blockchain Explorer</h1>
      <p className="subtitle">Navigate by page to manage and inspect your blockchain.</p>

      <nav className="navbar">
        {pages.map((navPage) => (
          <button
            key={navPage}
            type="button"
            className={`nav-btn ${page === navPage ? 'active' : ''}`}
            onClick={() => {
              setPage(navPage);
              clearStatus();
            }}
          >
            {navLabel(navPage)}
          </button>
        ))}
      </nav>

      {message && <p className="success">{message}</p>}
      {error && <p className="notice">{error}</p>}

      {page === 'explorer' && (
        <section className="card stack">
          <h2>Latest Block Explorer</h2>
          <form className="stack" onSubmit={trackBlockByHash}>
            <label>
              Search Block By Hash
              <input
                value={hashQuery}
                onChange={(e) => setHashQuery(e.target.value)}
                placeholder="Paste block hash"
              />
            </label>
            <button type="submit">Find Block</button>
          </form>

          <label>
            Select Block From List
            <select value={selectedIndex} onChange={onSelectBlock}>
              {blockOptions.map((option) => (
                <option key={option.index} value={option.index}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" type="button" onClick={selectLatest}>
            Go to Latest Block
          </button>

          <div className="stack">
            <h3>Block #{selectedIndex}</h3>
            <p className="meta">Timestamp: {formatTs(viewedBlock?.timestamp ?? viewedBlock?.timestamps)}</p>
            <p className="meta">Hash: <code>{viewedBlock?.hash}</code></p>
            <p className="meta">Previous Hash: <code>{viewedBlock?.previousHash}</code></p>
            <p className="meta">Nonce: {viewedBlock?.nonce ?? 0}</p>
          </div>

          <div>
            <h3>Transactions In This Block</h3>
            {transactions.length === 0 && <p className="small">No transactions in this block.</p>}
            {transactions.map((tx, idx) => (
              <div className="tx-item" key={`${idx}-${tx.txId}-${tx.sender}-${tx.receiver}`}>
                <p className="small">Tx ID: <code>{tx.txId}</code></p>
                <p className="small">Sender: <code>{tx.sender ?? 'SYSTEM'}</code></p>
                <p className="small">Receiver: <code>{tx.receiver}</code></p>
                <p className="small">Recorded Amount: {tx.recordedAmount}</p>
                <p className="small">Timestamp: {formatTs(tx.timestamp)}</p>
                <p className="small">Computed Total: {tx?.data?.total ?? 0}</p>
                {Array.isArray(tx?.data?.items) && tx.data.items.length > 0 && (
                  <div className="items-list">
                    {tx.data.items.map((item, itemIndex) => (
                      <p className="small" key={`${tx.txId}-${item.name}-${itemIndex}`}>
                        {item.name} - {item.price} x {item.qty}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="card stack mini-card">
            <h3>Chain Status</h3>
            <p>Total Blocks: {chain.chain.length}</p>
            <p>Pending Transactions: {chain.pendingTransactions.length}</p>
            <p>Chain Valid: {chain.isChainValid() ? 'Yes' : 'No'}</p>
            <p>Current Difficulty: {chain.difficulty}</p>
            <p>Current Mining Reward: {chain.miningRewards}</p>
          </div>
        </section>
      )}

      {page === 'transaction' && (
        <section className="card stack">
          <h2>Add Transaction</h2>
          <form className="stack" onSubmit={addTransaction}>
            <label>
              Sender Private Key
              <input
                value={txForm.fromPrivateKey}
                onChange={(e) => updateTxField('fromPrivateKey', e.target.value)}
                placeholder="Private key"
              />
            </label>
            <label>
              Sender Name
              <input
                value={txForm.sender}
                onChange={(e) => updateTxField('sender', e.target.value)}
                placeholder="Sender"
              />
            </label>
            <label>
              Choose Cafe/Company
              <select
                value={txForm.receiver}
                onChange={(e) => updateTxField('receiver', e.target.value)}
              >
                <option value="">Select company</option>
                {companyOptions.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </label>
            <div className="tx-item">
              <p className="small"><strong>Items (fixed price, categorized)</strong></p>
              {!txForm.receiver && (
                <p className="small">Choose a cafe/company first, then add items.</p>
              )}
              {txForm.itemLines.length === 0 && (
                <p className="small">No items yet. Click Add to create one item line.</p>
              )}
              {txForm.itemLines.map((line, index) => (
                <div className="item-line-grid" key={`line-${index}`}>
                  <div className="item-line-main">
                    <p className="small"><strong>Item #{index + 1}</strong></p>
                    <label className="small">
                      Category
                      <select
                        value={line.category}
                        onChange={(e) => updateItemLine(index, 'category', e.target.value)}
                      >
                        {categoryNames.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="small">
                      Quantity
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.qty}
                        onChange={(e) => updateItemLine(index, 'qty', e.target.value)}
                      />
                    </label>
                    <p className="small">
                      Selected: {line.itemName || '-'}
                    </p>
                  </div>
                  <aside className="item-sidebar">
                    <p className="small"><strong>Available Items</strong></p>
                    {(menuByCategory[line.category] ?? []).map((item) => (
                      <button
                        key={`${line.category}-${item.name}-${index}`}
                        type="button"
                        className={`item-choice-btn ${line.itemName === item.name ? 'active' : ''}`}
                        onClick={() => updateItemLine(index, 'itemName', item.name)}
                      >
                        {item.name} ({item.price})
                      </button>
                    ))}
                  </aside>
                </div>
              ))}
              <div className="item-actions">
                <button
                  type="button"
                  className="small-btn secondary"
                  onClick={addItemLine}
                  disabled={!txForm.receiver}
                >
                  + Add
                </button>
                {txForm.itemLines.length > 0 && (
                  <button
                    type="button"
                    className="small-btn secondary"
                    onClick={() => removeItemLine(txForm.itemLines.length - 1)}
                  >
                    - Remove
                  </button>
                )}
              </div>
              <p className="small">Recorded Amount (auto): {previewTotal}</p>
            </div>
            <button type="submit">Create Pending Transaction</button>
          </form>
        </section>
      )}

      {page === 'mine' && (
        <section className="card stack">
          <h2>Mine Block</h2>
          <form className="stack" onSubmit={mineNow}>
            <label>
              Mining Reward Receiver
              <input
                value={mineAddress}
                onChange={(e) => setMineAddress(e.target.value)}
                placeholder="Name that receives mining reward"
              />
            </label>
            <button type="submit">Mine Pending Transactions</button>
          </form>
          <p className="small">Pending transactions right now: {chain.pendingTransactions.length}</p>
        </section>
      )}

      {page === 'address' && (
        <section className="card stack">
          <h2>Search Address</h2>
          <label>
            Participant Name
            <input
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              placeholder="Search sender/receiver name"
            />
          </label>
          {addressQuery.trim() && (
            <>
              <p>Balance: <strong>{searchedBalance}</strong></p>
              <p>Blocks Mined: <strong>{searchedBlocksMined}</strong></p>
              <p className="small">Transactions found: {foundAddressTransactions.length}</p>
              <div className="scroll-area">
                {foundAddressTransactions.length === 0 && (
                  <p className="small">No transactions for this address yet.</p>
                )}
                {foundAddressTransactions.map((item, idx) => (
                  <div className="tx-item" key={`${item.blockHash}-${idx}`}>
                    <p className="small">Block #{item.blockIndex}</p>
                    <p className="small">Time: {formatTs(item.timestamp)}</p>
                    <p className="small">Tx ID: <code>{item.tx.txId}</code></p>
                    <p className="small">Sender: <code>{item.tx.sender ?? 'SYSTEM'}</code></p>
                    <p className="small">Receiver: <code>{item.tx.receiver}</code></p>
                    <p className="small">Recorded Amount: {item.tx.recordedAmount}</p>
                    <p className="small">Computed Total: {item.tx?.data?.total ?? 0}</p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => jumpToBlock(item.blockIndex)}
                    >
                      Open This Block
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {page === 'admin' && (
        <section className="card stack admin-card">
          <h2>Admin Panel</h2>
          <form className="stack" onSubmit={applyAdminSettings}>
            <label>
              Mining Difficulty
              <input
                type="number"
                min="1"
                step="1"
                value={adminForm.difficulty}
                onChange={(e) => updateAdminField('difficulty', e.target.value)}
              />
            </label>
            <label>
              Mining Reward
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={adminForm.reward}
                onChange={(e) => updateAdminField('reward', e.target.value)}
              />
            </label>
            <button type="submit">Apply Settings</button>
          </form>
          <p className="small">Current difficulty: {chain.difficulty}</p>
          <p className="small">Current mining reward: {chain.miningRewards}</p>
        </section>
      )}
    </div>
  );
}
