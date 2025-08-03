document.addEventListener('DOMContentLoaded', () => {
  // ⚙️ Core elements
  const calendar      = document.getElementById('calendar');
  const labels        = document.getElementById('labels');
  const scrollWrapper = document.getElementById('scroll-wrapper');
  const palette       = document.getElementById('palette');
  const createBtn     = document.getElementById('create-block-btn');

  // 🔧 State
  let selectedBlock     = null;
  let copiedBlockData   = null;
  let latestMouseY      = 0;
  let draggedPaletteItem= null;
  const initialTypes    = ['work','eat','exercise','free time','going out','misc'];

  // 🎨 Color helper
  function getColorForType(type) {
    if (type==='eat' || type==='exercise')              return 'lightyellow';
    if (['free time','going out','misc'].includes(type))return '#ffe0e0';
    if (type==='work')                                  return '#e0ffe0';
    return '#ddd';
  }

  // 📅 Build calendar grid & current-time line
  const currentTimeLine = document.createElement('div');
  currentTimeLine.id = 'current-time-line';
  calendar.appendChild(currentTimeLine);

  function updateCurrentTimeLine() {
    const now     = new Date(),
          minutes = now.getHours()*60 + now.getMinutes(),
          y       = Math.round(minutes/15)*15;
    currentTimeLine.style.top = `${y}px`;
  }
  updateCurrentTimeLine();
  setInterval(updateCurrentTimeLine, 60000);

  for (let i = 0; i < 96; i++) {
    const slot = document.createElement('div');
    slot.className = 'time-slot' + (i % 4 === 0 ? ' hour' : '');
    calendar.appendChild(slot);
    if (i % 4 === 0) {
      const line = document.createElement('div');
      line.className = 'label-line';
      line.style.top = `${i*15}px`;
      const h    = Math.floor(i/4),
            ampm = h >= 12 ? 'pm' : 'am',
            dh   = h % 12 || 12;
      line.innerText = `${dh}:00 ${ampm}`;
      labels.appendChild(line);
    }
  }

  // 🔹 Placeholder for drop preview
  const placeholder = document.createElement('div');
  placeholder.className = 'placeholder';
  placeholder.style.display = 'none';
  calendar.appendChild(placeholder);

  // --- PALETTE REORDER via drag-and-drop ---
  // Track which custom item is being dragged
  palette.addEventListener('dragstart', e => {
    const tpl = e.target;
    if (tpl.classList.contains('draggable-template') && !initialTypes.includes(tpl.dataset.type)) {
      draggedPaletteItem = tpl;
      e.dataTransfer.effectAllowed = 'move';
    }
  });
  palette.addEventListener('dragend', () => {
    draggedPaletteItem = null;
  });
  // On dragover, move the dragged item among customs
  palette.addEventListener('dragover', e => {
    if (!draggedPaletteItem) return;
    e.preventDefault();
    const after = [...palette.querySelectorAll('.draggable-template')]
      .filter(el => !initialTypes.includes(el.dataset.type) && el !== draggedPaletteItem)
      .reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height/2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    if (!after) {
      palette.insertBefore(draggedPaletteItem, createBtn);
    } else {
      palette.insertBefore(draggedPaletteItem, after);
    }
  });
  palette.addEventListener('drop', e => {
    if (!draggedPaletteItem) return;
    e.preventDefault();
    saveCustomBlocks();
    draggedPaletteItem = null;
  });

  // 🔧 Initialize each palette item (both default & custom)
  function initPaletteItem(tpl) {
    tpl.draggable = true;
    tpl.dataset.type = tpl.innerText.trim().toLowerCase();
    tpl.style.backgroundColor = getColorForType(tpl.dataset.type);

    // Drag to calendar
    tpl.addEventListener('dragstart', e => {
      // For calendar drop tracking
      e.dataTransfer.setData('text/plain', tpl.dataset.type);
      // Hide browser ghost
      const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
      e.dataTransfer.setDragImage(img,0,0);
      placeholder.style.display = 'block';
    });
    tpl.addEventListener('dragend', () => {
      placeholder.style.display = 'none';
    });

    // Single-click selects
    tpl.addEventListener('click', e => {
      deselectBlock();
      tpl.classList.add('selected');
      selectedBlock = tpl;
      e.stopPropagation();
    });
    // Double-click edits
    tpl.addEventListener('dblclick', () => {
      tpl.classList.add('editing');
      tpl.setAttribute('contenteditable','true');
      tpl.focus();
    });
    tpl.addEventListener('blur', () => {
      tpl.classList.remove('editing');
      tpl.removeAttribute('contenteditable');
      tpl.dataset.type = tpl.innerText.trim().toLowerCase()||'custom';
      tpl.style.backgroundColor = getColorForType(tpl.dataset.type);
      saveCustomBlocks();
    });
  }

  // Load & instantiate saved custom blocks
  chrome.storage.local.get('customBlocks', data => {
    (data.customBlocks || []).forEach(txt => {
      const tpl = document.createElement('div');
      tpl.className = 'draggable-template';
      tpl.innerText = txt;
      palette.insertBefore(tpl, createBtn);
    });
    document.querySelectorAll('.draggable-template').forEach(initPaletteItem);
  });

  // “+ create block” button
  createBtn.addEventListener('click', () => {
    const tpl = document.createElement('div');
    tpl.className = 'draggable-template';
    tpl.innerText = '';
    initPaletteItem(tpl);
    palette.insertBefore(tpl, createBtn);
    saveCustomBlocks();
  });

  function saveCustomBlocks() {
    const customs = [...palette.children]
      .filter(el => el.classList.contains('draggable-template') && !initialTypes.includes(el.dataset.type))
      .map(el => el.dataset.type);
    chrome.storage.local.set({ customBlocks: customs });
  }

  // 🔹 Persist scroll position
  scrollWrapper.addEventListener('scroll', () => {
    chrome.storage.local.set({ scrollTop: scrollWrapper.scrollTop });
  });

  // 📥 Calendar dragover/drop (only show tint when over calendar)
  calendar.addEventListener('dragover', e => {
    e.preventDefault();
    const calRect = calendar.getBoundingClientRect();
    if (e.clientX < calRect.left || e.clientX > calRect.right) {
      placeholder.style.display = 'none';
      return;
    }
    const wr    = scrollWrapper.getBoundingClientRect();
    const rawY  = (e.clientY - wr.top + scrollWrapper.scrollTop) - 30;
    const snapped = Math.round(rawY/15)*15;
    placeholder.style.top = `${Math.max(0, Math.min(snapped, calendar.clientHeight-60))}px`;
    placeholder.style.display = 'block';
  });
  calendar.addEventListener('dragleave', () => {
    placeholder.style.display = 'none';
  });
  calendar.addEventListener('drop', e => {
    e.preventDefault();
    placeholder.style.display = 'none';

    // Compute drop Y
    const type = e.dataTransfer.getData('text/plain');
    const wr   = scrollWrapper.getBoundingClientRect();
    const rawY = (e.clientY - wr.top + scrollWrapper.scrollTop) - 30;
    const y    = Math.max(0, Math.min(calendar.clientHeight-60, Math.round(rawY/15)*15));

    // Create event
    const blk = document.createElement('div');
    blk.className = 'event';
    blk.innerText = type;
    blk.style.top = `${y}px`;
    blk.style.height = '60px';
    blk.style.backgroundColor = getColorForType(type);
    addBlockListeners(blk);
    makeDraggableAndResizable(blk);
    calendar.appendChild(blk);
    saveSchedule();

    // Remove custom from palette if dragged
    if (draggedPaletteItem && !initialTypes.includes(draggedPaletteItem.dataset.type)) {
      draggedPaletteItem.remove();
      saveCustomBlocks();
    }
    draggedPaletteItem = null;
  });

  // 🔲 Selection, delete, copy/paste
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('event')) deselectBlock();
  });
  document.addEventListener('keydown', e => {
    const isMac = /Mac/.test(navigator.platform),
          ctrl  = isMac ? e.metaKey : e.ctrlKey;
    if ((e.key==='Delete'||e.key==='Backspace') && selectedBlock && !selectedBlock.classList.contains('editing')) {
      selectedBlock.remove(); selectedBlock = null; saveSchedule();
    }
    if (ctrl && e.key==='c' && selectedBlock) {
      copiedBlockData = {
        text:   selectedBlock.innerText,
        height: selectedBlock.style.height,
        color:  selectedBlock.style.backgroundColor
      };
    }
    if (ctrl && e.key==='v' && copiedBlockData) {
      const rawY = latestMouseY - 30;
      const y    = Math.max(0, Math.min(calendar.clientHeight-parseInt(copiedBlockData.height||60),
                             Math.round(rawY/15)*15));
      const b = document.createElement('div');
      b.className = 'event';
      b.innerText = copiedBlockData.text;
      b.style.top = `${y}px`;
      b.style.height = copiedBlockData.height;
      b.style.backgroundColor = copiedBlockData.color;
      addBlockListeners(b);
      makeDraggableAndResizable(b);
      calendar.appendChild(b);
      saveSchedule();
    }
  });
  calendar.addEventListener('mousemove', e => {
    const wr = scrollWrapper.getBoundingClientRect();
    latestMouseY = e.clientY - wr.top + scrollWrapper.scrollTop;
  });

  // 🔹 Helpers: selection + editing
  function deselectBlock() {
    if (selectedBlock) selectedBlock.classList.remove('selected');
    selectedBlock = null;
  }
  function addBlockListeners(b) {
    b.addEventListener('click', e => {
      deselectBlock();
      b.classList.add('selected');
      selectedBlock = b;
      e.stopPropagation();
    });
    b.addEventListener('dblclick', () => {
      b.classList.add('editing');
      b.setAttribute('contenteditable','true');
      b.focus();
    });
    b.addEventListener('blur', () => {
      b.classList.remove('editing');
      b.removeAttribute('contenteditable');
      saveSchedule();
    });
  }

  // 🔧 Helpers: drag & resize
  function makeDraggableAndResizable(el) {
    let isResizing=false, dir=null, offset=0;
    el.addEventListener('mousedown', e => {
      if (e.button!==0 || el.classList.contains('editing')) return;
      deselectBlock();
      offset = e.offsetY;
      const wr      = scrollWrapper.getBoundingClientRect();
      const startY  = e.clientY;
      const startTop= el.offsetTop;
      const startH  = el.offsetHeight;

      if (e.offsetY < 10)                { isResizing=true; dir='top'; }
      else if (e.offsetY > startH-10)    { isResizing=true; dir='bottom'; }

      function onMove(e) {
        const scrollY = scrollWrapper.scrollTop;
        if (isResizing) {
          if (dir==='bottom') {
            let h = Math.round((startH+(e.clientY-startY))/15)*15;
            h = Math.max(15, Math.min(h, calendar.clientHeight-startTop));
            el.style.height = `${h}px`;
          } else {
            let delta = e.clientY - startY,
                nt    = Math.round((startTop+delta)/15)*15,
                h     = Math.round((startH-delta)/15)*15;
            if (nt>=0 && nt+h<=calendar.clientHeight) {
              el.style.top    = `${nt}px`;
              el.style.height = `${h}px`;
            }
          }
        } else {
          let y = (e.clientY - wr.top + scrollY) - offset;
          y = Math.max(0, Math.min(y, calendar.clientHeight - el.offsetHeight));
          el.style.top = `${Math.round(y/15)*15}px`;
        }
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        isResizing=false; dir=null;
        saveSchedule();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // 🔒 Persist schedule
  function saveSchedule() {
    const arr = Array.from(calendar.querySelectorAll('.event')).map(evt => ({
      top:    evt.style.top,
      height: evt.style.height,
      text:   evt.innerText,
      color:  evt.style.backgroundColor
    }));
    chrome.storage.local.set({
      schedule:  arr,
      scrollTop: scrollWrapper.scrollTop
    });
  }

  // 🔄 Restore on load
  chrome.storage.local.get(['schedule','scrollTop'], data => {
    (data.schedule||[]).forEach(evt => {
      const b = document.createElement('div');
      b.className = 'event';
      b.innerText = evt.text;
      b.style.top = evt.top;
      b.style.height = evt.height;
      b.style.backgroundColor = evt.color;
      addBlockListeners(b);
      makeDraggableAndResizable(b);
      calendar.appendChild(b);
    });
    if (typeof data.scrollTop === 'number') {
      scrollWrapper.scrollTop = data.scrollTop;
    }
  });

});
