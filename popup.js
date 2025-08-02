// grab elements
const calendar = document.getElementById('calendar');
const labels = document.getElementById('labels');
const scrollWrapper = document.getElementById('scroll-wrapper');
let selectedBlock = null;

// current time line
const currentTimeLine = document.createElement('div');
currentTimeLine.id = 'current-time-line';
calendar.appendChild(currentTimeLine);

function updateCurrentTimeLine() {
  const now = new Date();
  const minutes = now.getHours()*60 + now.getMinutes();
  const pixels = Math.round(minutes/15)*15;
  currentTimeLine.style.top = `${pixels}px`;
}
updateCurrentTimeLine();
setInterval(updateCurrentTimeLine, 60000);

// build timeline slots & labels
for (let i = 0; i < 96; i++) {
  const slot = document.createElement('div');
  slot.className = 'time-slot' + (i%4===0 ? ' hour':'' );
  calendar.appendChild(slot);

  if (i % 4 === 0) {
    const line = document.createElement('div');
    line.className = 'label-line';
    line.style.top = `${i*15}px`;
    const h = Math.floor(i/4), m='00', ampm=h>=12?'pm':'am';
    const dh = h%12||12;
    line.innerText = `${dh}:${m} ${ampm}`;
    labels.appendChild(line);
  }
}

// palette drag setup
document.querySelectorAll('.draggable-template')
.forEach(template => {
  template.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', template.innerText);
    e.dataTransfer.setDragImage(template,0,0);
    deselectBlock();
  });
});

// calendar drop handler
calendar.addEventListener('dragover', e => e.preventDefault());
calendar.addEventListener('drop', e => {
  e.preventDefault();
  const type = e.dataTransfer.getData('text/plain').trim().toLowerCase();
  const block = document.createElement('div');
  block.className='event'; block.setAttribute('contenteditable',false);
  block.innerText=type;

  // color logic
  if      (type==='eat'||type==='exercise')      block.style.backgroundColor='lightyellow';
  else if (['free time','going out','misc'].includes(type)) block.style.backgroundColor='#ffe0e0';
  else if (type==='work')                        block.style.backgroundColor='#e0ffe0';
  else                                           block.style.backgroundColor='#ddd';

  // position
  const rect=calendar.getBoundingClientRect();
  let y=Math.round((e.clientY-rect.top)/15)*15;
  y=Math.max(0,Math.min(y,calendar.clientHeight-60));
  block.style.top=`${y}px`; block.style.height='60px';

  addBlockListeners(block);
  makeDraggableAndResizable(block);
  calendar.appendChild(block);
  saveSchedule();
});

// deselect/delete
document.addEventListener('click', e => {
  if (!e.target.classList.contains('event')) deselectBlock();
});
document.addEventListener('keydown', e => {
  if ((e.key==='Delete'||e.key==='Backspace') && selectedBlock && !selectedBlock.classList.contains('editing')) {
    selectedBlock.remove(); selectedBlock=null;
    saveSchedule();
  }
});
function deselectBlock(){
  if (selectedBlock) selectedBlock.classList.remove('selected');
  selectedBlock=null;
}

// event click/dblclick/blur
function addBlockListeners(block){
  block.addEventListener('click',e=>{
    deselectBlock(); block.classList.add('selected'); selectedBlock=block; e.stopPropagation();
  });
  block.addEventListener('dblclick',()=>{
    block.classList.add('editing');
    block.setAttribute('contenteditable',true);
    block.focus();
  });
  block.addEventListener('blur',()=>{
    block.classList.remove('editing');
    block.setAttribute('contenteditable',false);
    saveSchedule();
  });
}

// drag & resize
function makeDraggableAndResizable(el){
  let isResizing=false, dir=null, offsetY=0;
  el.addEventListener('mousedown', e=>{
    if (e.button !== 0 || el.classList.contains('editing')) return;
    deselectBlock();
    const rect=calendar.getBoundingClientRect();
    const startY=e.clientY, startTop=el.offsetTop, startH=el.offsetHeight;
    offsetY=e.offsetY;

    if (e.offsetY<10)      {isResizing=true; dir='top';}
    else if (e.offsetY>el.offsetHeight-10){isResizing=true; dir='bottom';}
    else                   {isResizing=false;}

    function onMouseMove(e){
      if (isResizing){
        if (dir==='bottom'){
          let h=Math.round((startH+(e.clientY-startY))/15)*15;
          h=Math.max(15,Math.min(h,calendar.clientHeight-startTop));
          el.style.height=`${h}px`;
        } else {
          let delta=e.clientY-startY;
          let newTop=Math.round((startTop+delta)/15)*15;
          let h=Math.round((startH-delta)/15)*15;
          if (newTop>=0 && newTop+h<=calendar.clientHeight){
            el.style.top=`${newTop}px`;
            el.style.height=`${h}px`;
          }
        }
      } else {
        let y=Math.round((e.clientY-rect.top-offsetY)/15)*15;
        y=Math.max(0,Math.min(y,calendar.clientHeight-el.offsetHeight));
        el.style.top=`${y}px`;
      }
    }
    function onMouseUp(){
      document.removeEventListener('mousemove',onMouseMove);
      document.removeEventListener('mouseup',onMouseUp);
      isResizing=false; dir=null;
      saveSchedule();  // save on release
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// persist: save and load
function saveSchedule() {
  const events = Array.from(document.querySelectorAll('.event')).map(event => ({
    top: event.style.top,
    height: event.style.height,
    text: event.innerText,
    color: event.style.backgroundColor || ''
  }));
  chrome.storage.local.set({
    schedule: events,
    scrollTop: scrollWrapper.scrollTop  // store scroll position too
  });
}

// Save scroll position on scroll
scrollWrapper.addEventListener('scroll', () => {
  chrome.storage.local.set({ scrollTop: scrollWrapper.scrollTop });
});

// Load from storage when popup opens
chrome.storage.local.get(['schedule', 'scrollTop'], data => {
  const events = data.schedule || [];
  for (const evt of events) {
    const block = document.createElement('div');
    block.className = 'event';
    block.innerText = evt.text;
    block.style.top = evt.top;
    block.style.height = evt.height;
    block.style.backgroundColor = evt.color || '#ddd';
    block.setAttribute('contenteditable', false);
    addBlockListeners(block);
    makeDraggableAndResizable(block);
    calendar.appendChild(block);
  }

  // restore scroll position
  if (typeof data.scrollTop === 'number') {
    scrollWrapper.scrollTop = data.scrollTop;
  }
});
