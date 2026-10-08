// Demo Shop — a tiny static app for TVideo's example clip and CI smoke test.
// Orders live in localStorage, so it runs from any static file server.
const KEY = 'demo-shop-orders';
const SEED = [
  { id: 'ORD-1001', customer: 'Greenleaf Market', product: 'Olive oil 500 ml', qty: 12, status: 'Shipped' },
  { id: 'ORD-1002', customer: 'Blue Harbor Cafe', product: 'Espresso cups', qty: 24, status: 'Packing' },
];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? SEED; } catch { return SEED; }
}

function renderOrders() {
  const rows = document.getElementById('rows');
  rows.innerHTML = load()
    .map((o) => `<tr><td>${o.id}</td><td>${o.customer}</td><td>${o.product}</td><td>${o.qty}</td><td><span class="pill">${o.status}</span></td></tr>`)
    .join('');
  const created = new URLSearchParams(location.search).get('created');
  if (created) {
    const toast = document.getElementById('toast');
    toast.textContent = `Order ${created} created`;
    toast.hidden = false;
  }
}

function initForm() {
  const combo = document.querySelector('.combo');
  const btn = combo.querySelector('.combo-btn');
  const list = combo.querySelector('.combo-list');
  const hidden = combo.querySelector('input[type=hidden]');
  btn.addEventListener('click', () => {
    list.hidden = !list.hidden;
    btn.setAttribute('aria-expanded', String(!list.hidden));
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    hidden.value = li.dataset.value;
    btn.textContent = li.dataset.value;
    btn.classList.add('chosen');
    list.hidden = true;
  });
  document.getElementById('order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const order = { customer: f.customer.value, product: f.product.value.trim(), qty: Number(f.qty.value), status: 'New' };
    if (!order.customer || !order.product || !(order.qty > 0)) {
      document.getElementById('error').hidden = false;
      return;
    }
    const orders = load();
    order.id = `ORD-${1001 + orders.length}`;
    localStorage.setItem(KEY, JSON.stringify([order, ...orders]));
    location.href = `./?created=${order.id}`;
  });
}
