const state = { config: {}, products: [], cart: JSON.parse(localStorage.getItem("medimart-cart") || "{}"), step: 0, checkout: {} };
const $ = (id) => document.getElementById(id);
const money = (value) => `${state.config.currency_symbol || "KSh"} ${Number(value).toLocaleString("en-KE")}`;
const escapeText = (value) => String(value);
const imageFor = (name) => {
  const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const aliases = {
    "diclofenac-gel": "diclofenac",
    "fluguard-tablets": "fluguard",
    "azithromycin-250mg": "azithromycin",
    "ciprofloxacin-500mg": "ciprofloxacin"
  };
  return `/images/${aliases[filename] || filename}.png`;
};
function hexRgb(hex){const value=hex.replace("#","");return value.length===3?value.split("").map((x)=>parseInt(x+x,16)): [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)]}
function rgbHex(rgb){return `#${rgb.map((x)=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,"0")).join("")}`}
function setBrand(name){const target=$("brand-name");target.replaceChildren();const bold=document.createElement("span");bold.className="wordmark-bold";bold.textContent=name.slice(0,4);const regular=document.createElement("span");regular.className="wordmark-regular";regular.textContent=name.slice(4);target.append(bold,regular)}
function saveCart(){localStorage.setItem("medimart-cart", JSON.stringify(state.cart));renderCartCount();}
function renderCartCount(){$("cart-count").textContent=Object.values(state.cart).reduce((a,b)=>a+b,0);}
function showToast(message){$("toast").textContent=message;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),3000);}
function productById(id){return state.products.find((p)=>p.id===Number(id));}
function renderProducts(){
  const query=$("search").value.toLowerCase(); const category=$("category-filter").value;
  const products=state.products.filter((p)=>(!category||p.category===category)&&(!query||`${p.name} ${p.category}`.toLowerCase().includes(query)));
  $("product-count").textContent=`${products.length} product${products.length===1?"":"s"}`;
  $("product-grid").replaceChildren(...products.map((p)=>{
    const card=document.createElement("article"); card.className="product-card";
    const status=p.stock===0?"Out of stock":p.stock<=5?`Only ${p.stock} left`:"In stock";
    card.innerHTML=`<div class="product-icon"><img src="${imageFor(p.name)}" alt="${escapeText(p.name)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden aria-hidden="true">${escapeText(p.emoji)}</span></div><h3></h3><div class="product-meta"></div><div class="price">${money(p.price)}</div>${p.requires_rx?'<span class="rx-badge">Prescription required</span>':""}<div class="stock ${p.stock===0?"out-stock":p.stock<=5?"low-stock":"in-stock"}">${status}</div>`;
    card.querySelector("h3").textContent=p.name; card.querySelector(".product-meta").textContent=p.category;
    const button=document.createElement("button");button.className="primary-button";button.textContent="Add to cart";button.disabled=p.stock===0;button.onclick=()=>addToCart(p.id);card.append(button);return card;
  }));
}
function addToCart(id){const p=productById(id);if(!p||p.stock===0)return;const next=(state.cart[id]||0)+1;if(next>p.stock){showToast(`Only ${p.stock} left of ${p.name}`);return}state.cart[id]=next;saveCart();showToast(`${p.name} added to cart`);}
function renderCart(){
  const wrap=$("cart-items");wrap.className="cart-list";wrap.replaceChildren();
  const ids=Object.keys(state.cart).filter((id)=>productById(id));
  if(!ids.length){wrap.innerHTML='<p class="muted">Your cart is empty.</p>'}
  ids.forEach((id)=>{const p=productById(id),qty=state.cart[id],row=document.createElement("div");row.className="cart-row";row.innerHTML='<div class="cart-row-title"></div><div class="product-meta"></div><div class="qty-controls"><button aria-label="Decrease quantity">−</button><strong></strong><button aria-label="Increase quantity">+</button></div><button class="remove-button">Remove</button>';row.querySelector(".cart-row-title").textContent=p.name;row.querySelector(".product-meta").textContent=money(p.price*qty);row.querySelector("strong").textContent=qty;row.querySelectorAll("button")[0].onclick=()=>changeQty(id,-1);row.querySelectorAll("button")[1].onclick=()=>changeQty(id,1);row.querySelector(".remove-button").onclick=()=>{delete state.cart[id];saveCart();renderCart()};wrap.append(row)});
  $("cart-subtotal").textContent=money(ids.reduce((sum,id)=>sum+productById(id).price*state.cart[id],0));$("checkout-button").disabled=!ids.length;
}
function changeQty(id,delta){const p=productById(id),next=(state.cart[id]||0)+delta;if(next<1)delete state.cart[id];else if(next<=p.stock)state.cart[id]=next;else showToast(`Only ${p.stock} left of ${p.name}`);saveCart();renderCart();}
function openPanel(id){$(id).classList.add("open");$(id).setAttribute("aria-hidden","false");if(id==="cart-panel")renderCart()}
function closePanel(id){$(id).classList.remove("open");$(id).setAttribute("aria-hidden","true")}
function checkoutStep(){
  const labels=["Cart","Delivery details","Payment","Review & confirm"];$("step-labels").replaceChildren(...labels.map((x,i)=>{const s=document.createElement("span");s.textContent=x;s.className=i===state.step?"active":"";return s}));$("progress-bar").style.width=`${(state.step+1)*25}%`;
  const body=document.createElement("div");body.className="checkout-body";const ids=Object.keys(state.cart), subtotal=ids.reduce((sum,id)=>sum+productById(id).price*state.cart[id],0);
  if(state.step===0){body.innerHTML=`<h3>Review your cart</h3><p>${ids.length} item type(s) · Subtotal ${money(subtotal)}</p>${state.products.some(p=>p.requires_rx&&state.cart[p.id])?'<p class="warning">This cart contains prescription items. Please have a valid prescription ready.</p>':""}<div class="checkout-actions"><button class="primary-button" data-next>Continue to delivery</button></div>`}
  if(state.step===1){body.innerHTML='<h3>Delivery details</h3><label for="customer-name">Full name</label><input id="customer-name" required><label for="customer-phone">Phone</label><input id="customer-phone" required><label for="customer-address">Address</label><textarea id="customer-address" required></textarea><div class="checkout-actions"><button class="secondary-button" data-back>Back</button><button class="primary-button" data-next>Continue to payment</button></div>';["name","phone","address"].forEach((key)=>{const el=$(`customer-${key}`);el.value=state.checkout[key]||""})}
  if(state.step===2){body.innerHTML='<h3>Payment method</h3><label><input type="radio" name="payment" value="Pay on delivery"> Pay on delivery</label><label><input type="radio" name="payment" value="Card demo"> Card demo</label><label><input type="radio" name="payment" value="Bank transfer demo"> Bank transfer demo</label><div class="checkout-actions"><button class="secondary-button" data-back>Back</button><button class="primary-button" data-next>Review order</button></div>';body.querySelector(`[value="${state.checkout.payment||"Pay on delivery"}"]`).checked=true}
  if(state.step===3){body.innerHTML=`<h3>Confirm your order</h3><p><strong>${escapeText(state.checkout.name)}</strong><br>${escapeText(state.checkout.phone)}<br>${escapeText(state.checkout.address)}</p><p>Payment: ${escapeText(state.checkout.payment)}</p><p>Subtotal: ${money(subtotal)}<br>Delivery: ${money(state.config.delivery_fee)}<br><strong>Total: ${money(subtotal+state.config.delivery_fee)}</strong></p><div class="checkout-actions"><button class="secondary-button" data-back>Back</button><button class="primary-button" data-confirm>Place order</button></div>`}
  body.querySelector("[data-back]")?.addEventListener("click",()=>{state.step--;checkoutStep()});body.querySelector("[data-next]")?.addEventListener("click",()=>{if(state.step===1&&!collectDelivery())return;if(state.step===2)state.checkout.payment=body.querySelector("input[name=payment]:checked").value;state.step++;checkoutStep()});body.querySelector("[data-confirm]")?.addEventListener("click",placeOrder);$("checkout-content").replaceChildren(body);
}
function collectDelivery(){let valid=true;["name","phone","address"].forEach((key)=>{const el=$(`customer-${key}`);state.checkout[key]=el.value.trim();if(!state.checkout[key]){el.focus();valid=false}});if(!valid)showToast("Please complete your delivery details.");return valid}
async function placeOrder(){const response=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:state.checkout.name,phone:state.checkout.phone,address:state.checkout.address,payment:state.checkout.payment,items:Object.entries(state.cart).map(([product_id,qty])=>({product_id:Number(product_id),qty}))})});const data=await response.json();if(!response.ok){showToast(data.error||"Order failed");return}state.cart={};saveCart();closePanel("checkout-modal");$("confirmation-title").textContent=`Order #${data.order_id} confirmed`;$("confirmation-text").textContent=`Thank you for shopping with ${state.config.name}. Your health is on its way.`;openPanel("confirmation");state.products=await fetch("/api/products").then(r=>r.json());renderProducts()}
async function init(){state.config=await fetch("/api/config").then(r=>r.json());const primary=state.config.primary, rgb=hexRgb(primary);document.documentElement.style.setProperty("--primary",primary);document.documentElement.style.setProperty("--primary-dark",rgbHex(rgb.map((x)=>x*.75)));document.documentElement.style.setProperty("--primary-soft",rgbHex(rgb.map((x)=>x*.1+255*.9)));setBrand(state.config.name);$("tagline").textContent=state.config.tagline;document.title=`${state.config.name} | Online Pharmacy`;state.products=await fetch("/api/products").then(r=>r.json());[...new Set(state.products.map(p=>p.category))].forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;$("category-filter").append(o)});renderProducts();renderCartCount()}
$("search").addEventListener("input",renderProducts);$("category-filter").addEventListener("change",renderProducts);$("cart-button").onclick=()=>openPanel("cart-panel");$("checkout-button").onclick=()=>{closePanel("cart-panel");state.step=0;state.checkout={};openPanel("checkout-modal");checkoutStep()};document.querySelectorAll("[data-close]").forEach((b)=>b.onclick=()=>closePanel(b.dataset.close));init();
