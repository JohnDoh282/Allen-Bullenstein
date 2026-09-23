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
