const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-nav');

if (menuToggle && navigation) {
  menuToggle.addEventListener('click', () => {
    const isOpen = navigation.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    navigation.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));
}

document.querySelector('#year').textContent = new Date().getFullYear();


// Allen Rugpull Simulator — fictional paper-trading game
const game = { balance: 10, position: 0, price: 1, avg: 0, history: [1], timer: null };
const $ = (id) => document.getElementById(id);
function gameMsg(text){ $('game-message').textContent = text; }
function renderGame(){ $('balance').textContent = game.balance.toFixed(2)+' SOL'; $('position').textContent = game.position.toFixed(2)+' FAKE'; $('price').textContent = '$'+game.price.toFixed(2); drawChart(); }
function drawChart(){ const c=$('trade-chart'),x=c.getContext('2d'),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.strokeStyle='rgba(245,242,232,.12)';for(let i=1;i<6;i++){x.beginPath();x.moveTo(0,i*h/6);x.lineTo(w,i*h/6);x.stroke()}x.beginPath();game.history.forEach((v,i)=>{const xx=i/(game.history.length-1||1)*w;const yy=h-((v-Math.min(...game.history))/(Math.max(...game.history)-Math.min(...game.history)||1))*(h-24)-12;i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.strokeStyle='#c8ff00';x.lineWidth=3;x.stroke();}
function tick(){ const drift=(Math.random()-.52)*.12; game.price=Math.max(.12,game.price*(1+drift)); if(game.history.length>80)game.history.shift();game.history.push(game.price);renderGame(); }
$('trade-size')?.addEventListener('input',e=>$('trade-size-value').textContent=Number(e.target.value).toFixed(2)+' SOL');
$('buy-btn')?.addEventListener('click',()=>{const sol=Number($('trade-size').value);if(sol>game.balance)return gameMsg('Allen: “You are overleveraged already.”');const tokens=sol/game.price;game.avg=((game.avg*game.position)+(game.price*tokens))/(game.position+tokens);game.position+=tokens;game.balance-=sol;gameMsg('BUY FILLED — Allen nods approvingly for absolutely no reason.');renderGame();});
$('sell-btn')?.addEventListener('click',()=>{if(!game.position)return gameMsg('Nothing to sell. Allen is disappointed.');const proceeds=game.position*game.price;const pnl=proceeds-(game.position*game.avg);game.balance+=proceeds;gameMsg((pnl>=0?'PROFIT ':'LOSS ')+(pnl>=0?'+':'')+pnl.toFixed(2)+' SOL — Allen says the exit was “strategic.”');game.position=0;game.avg=0;renderGame();});
$('reset-btn')?.addEventListener('click',()=>{game.balance=10;game.position=0;game.price=1;game.avg=0;game.history=[1];gameMsg('Fresh wallet. Same terrible decisions.');renderGame();});
if($('trade-chart')){renderGame();game.timer=setInterval(tick,900);}


// Solana wallet connections — connection only; no transaction is signed or sent.
let activeWallet = null;
const shortAddress = (a) => a ? a.slice(0,4)+'…'+a.slice(-4) : 'NOT CONNECTED';
function setWallet(address, name){ activeWallet={address,name}; const label=$('wallet-address'); if(label) label.textContent=name+' / '+shortAddress(address); const btn=$('wallet-connect'); if(btn) btn.textContent='CONNECTED: '+shortAddress(address); }
function clearWallet(){activeWallet=null; if($('wallet-address'))$('wallet-address').textContent='NOT CONNECTED'; if($('wallet-connect'))$('wallet-connect').textContent='CONNECT WALLET';}
async function connectPhantom(){
  try { const provider=window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null); if(!provider) throw new Error('Phantom was not detected. Install the Phantom browser extension first.'); const res=await provider.connect(); setWallet(res.publicKey.toString(),'PHANTOM'); gameMsg('Phantom connected. Allen says: “Now we can make some terrible decisions.”'); }
  catch(e){gameMsg('Wallet connection cancelled or unavailable: '+e.message);}
}
async function connectMetaMask(){
  try {
    // MetaMask now supports Solana wallet connectivity; prefer a Wallet Standard Solana provider when exposed.
    const wallets = window.walletStandardWallets || [];
    const mm = wallets.find(w=>/metamask/i.test(w.name) && w.chains?.some(c=>String(c).startsWith('solana:')));
    if(mm){ const feature=mm.features?.['standard:connect']; if(!feature) throw new Error('MetaMask was found but does not expose Solana connect on this browser.'); const res=await feature.connect(); const account=res.accounts?.find(a=>String(a.chains?.[0]||'').startsWith('solana:')) || res.accounts?.[0]; if(account) setWallet(account.address,'METAMASK'); else throw new Error('No Solana account returned.'); gameMsg('MetaMask connected. Allen is pretending this was part of the plan.'); return; }
    const eth=window.ethereum?.providers?.find(p=>p.isMetaMask) || (window.ethereum?.isMetaMask ? window.ethereum : null);
    if(eth) throw new Error('MetaMask was detected, but its Solana Wallet Standard provider is not exposed in this browser. Try the latest MetaMask extension.');
    throw new Error('MetaMask was not detected. Install the latest MetaMask extension.');
  } catch(e){gameMsg('MetaMask: '+e.message);}
}
async function discoverWalletStandard(){
  try { const mod=await import('https://esm.sh/@wallet-standard/app@1.1.0'); const reg=mod.getWallets(); const sync=()=>{window.walletStandardWallets=reg.get();}; reg.on('register',sync); sync(); } catch(e) { console.warn('Wallet Standard discovery unavailable',e); }
}
$('wallet-connect')?.addEventListener('click',()=>activeWallet?clearWallet():connectPhantom());
$('phantom-connect')?.addEventListener('click',connectPhantom); $('metamask-connect')?.addEventListener('click',connectMetaMask); $('wallet-disconnect')?.addEventListener('click',async()=>{try{const p=window.phantom?.solana;if(p?.disconnect)await p.disconnect();}catch{}clearWallet();});
discoverWalletStandard();
