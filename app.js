// Core state values for filter & random album UI
const state = {
    albums: [],
    descriptors: new Map(), // Checkbox state for descriptors
    validGenres: new Set(),
    currentAlbum: null,
    selectedGenre: "Any Genre",
    suppressEvents: false
};

// UI Elements
const els = {
    tree: document.getElementById('genreTree'),
    txtSearchDesc: document.getElementById('txtSearchDescriptors'),
    btnSelectAll: document.getElementById('btnSelectAll'),
    btnDeselectAll: document.getElementById('btnDeselectAll'),
    descList: document.getElementById('descriptorList'),
    btnRandom: document.getElementById('btnRandom'),
    btnClear: document.getElementById('btnClear'),
    lblMatchCount: document.getElementById('lblMatchCount'),
    txtAlbumSearch: document.getElementById('txtAlbumSearch'),
    lstSearchResults: document.getElementById('lstSearchResults'),
    txtAlbumDetails: document.getElementById('txtAlbumDetails'),
    streamingRow: document.getElementById('streamingLinks'),
    btnSpotify: document.getElementById('btnSpotify'),
    btnApple: document.getElementById('btnApple'),
    btnYoutube: document.getElementById('btnYoutube'),
    btnQobuz: document.getElementById('btnQobuz')
};

function getAlbumId(a) { return `${a.artist_name} - ${a.release_name}`; }

// --- Initialization ---
function initMobileCollapses() {
    const isMobile = window.innerWidth <= 900;
    document.querySelectorAll('.mobile-collapse').forEach(d => {
        d.open = !isMobile;
    });
}
window.addEventListener('resize', initMobileCollapses);

window.addEventListener('DOMContentLoaded', async () => {
    initMobileCollapses();
    try {
        const [csvRes, jsonRes, descRes] = await Promise.all([
            fetch('Data/rym_clean1.csv'),
            fetch('Data/filtered_hierarchy.json'),
            fetch('Data/descriptors_reference.csv')
        ]);
        
        if (!csvRes.ok || !jsonRes.ok || !descRes.ok) {
            throw new Error("HTTP Error loading one or more Data/ files.");
        }
        
        const csvText = await csvRes.text();
        const hierarchy = await jsonRes.json();
        const descText = await descRes.text();

        Papa.parse(csvText, {
            header: true, skipEmptyLines: true,
            complete: function(res) {
                state.albums = res.data.map(row => {
                    const gText = (row.primary_genres || "") + "," + (row.secondary_genres || "");
                    const dText = row.descriptors || "";
                    
                    return {
                        ...row,
                        id: getAlbumId(row),
                        _gSet: new Set(gText.split(',').map(s => s.trim().toLowerCase())),
                        _dSet: new Set(dText.split(',').map(s => s.trim().toLowerCase()))
                    }
                });
                
                Papa.parse(descText, {
                    header: true, skipEmptyLines: true,
                    complete: function(r2) {
                        r2.data.forEach(d => {
                            if (d.Descriptor) {
                                state.descriptors.set(d.Descriptor.toLowerCase(), true);
                            } else if (d.descriptor) {
                                // sometimes headers get lowercase
                                state.descriptors.set(d.descriptor.toLowerCase(), true);
                            } else if (Object.keys(d).length > 0) {
                                // fallback grab first key
                                const firstKey = Object.keys(d)[0];
                                if (d[firstKey]) state.descriptors.set(d[firstKey].toLowerCase(), true);
                            }
                        });
                        
                        els.txtAlbumDetails.textContent = "Data successfully loaded! Choose filters and pick an album.";
                        els.tree.innerHTML = "";
                        renderDescList();
                        renderTree(hierarchy, els.tree);
                        updateMatches();
                    }
                });
            }
        });
    } catch(err) {
        console.error(err);
        els.txtAlbumDetails.textContent = "Error loading files. Ensure Data/ files exist! See console for details.";
    }
});

// --- Filtering Logic ---
function getFilteredPool() {
    const isAnyGenre = state.selectedGenre === "Any Genre";
    
    const activeDesc = new Set();
    state.descriptors.forEach((val, key) => { if (val) activeDesc.add(key); });

    return state.albums.filter(a => {
        // Genre Match
        if (!isAnyGenre) {
            let gMatch = false;
            for (let g of a._gSet) {
                if (state.validGenres.has(g)) { gMatch = true; break; }
            }
            if (!gMatch) return false;
        }
        
        // Desc Match (Any matched)
        let dMatch = false;
        for (let d of a._dSet) {
            if (activeDesc.has(d)) { dMatch = true; break; }
        }
        if (!dMatch && activeDesc.size > 0) return false;
        
        return true;
    });
}

function updateMatches() {
    const pool = getFilteredPool();
    els.lblMatchCount.textContent = `Matched albums: ${pool.length}`;
}

// --- Renderers ---
function renderDescList(filterStr = "") {
    els.descList.innerHTML = '';
    const q = filterStr.toLowerCase();
    
    Array.from(state.descriptors.keys()).sort().forEach(d => {
        if (!d.includes(q)) return;
        
        const lbl = document.createElement('label');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = state.descriptors.get(d);
        chk.onchange = e => {
            state.descriptors.set(d, e.target.checked);
            updateMatches();
        };
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(" " + d));
        els.descList.appendChild(lbl);
    });
}

function renderTree(node, container) {
    if (node.name === "Root") {
        node.children.forEach(c => renderTree(c, container));
        return;
    }
    
    const isParent = node.children && node.children.length > 0;
    const wrp = isParent ? document.createElement('details') : document.createElement('div');
    if (isParent && node.name === "Genres") wrp.open = true; // Auto open main list
    
    const header = isParent ? document.createElement('summary') : document.createElement('span');
    header.textContent = node.name;
    header.style.cursor = 'pointer';
    if (!isParent) header.style.paddingLeft = '20px';
    
    header.onclick = (e) => {
        if (!isParent) e.stopPropagation();
        
        document.querySelectorAll('.genre-active').forEach(x => { x.style.fontWeight = 'normal'; x.classList.remove('genre-active'); });
        header.style.fontWeight = 'bold';
        header.classList.add('genre-active');
        
        state.selectedGenre = node.name;
        rebuildValidGenresSet(node);
        updateMatches();
    };
    
    wrp.appendChild(header);
    if (isParent) {
        node.children.forEach(c => {
            const childContainer = document.createElement('div');
            renderTree(c, wrp);
        });
    }
    container.appendChild(wrp);
}

function rebuildValidGenresSet(node) {
    state.validGenres.clear();
    function addLayer(n) {
        if (n.name !== "Genres" && n.name !== "Root" && n.name !== "Any Genre") {
            state.validGenres.add(n.name.toLowerCase());
        }
        if (n.children) n.children.forEach(c => addLayer(c));
    }
    addLayer(node);
}

function displayAlbum(album) {
    state.currentAlbum = album;
    
    let txt = `=================================\n`;
    txt += `Release Name     : ${album.release_name}\n`;
    txt += `Artist           : ${album.artist_name}\n`;
    txt += `Release Date     : ${album.release_date || "N/A"}\n`;
    txt += `Release Type     : ${album.release_type || "N/A"}\n`;
    txt += `Primary Genres   : ${album.primary_genres || "N/A"}\n`;
    txt += `Secondary Genres : ${album.secondary_genres || "N/A"}\n`;
    txt += `Descriptors      : ${album.descriptors || "N/A"}\n`;
    els.txtAlbumDetails.textContent = txt;
    
    // Generate dynamic streaming links!
    const query = encodeURIComponent(`${album.artist_name} ${album.release_name}`);
    els.btnSpotify.href = `https://open.spotify.com/search/${query}/albums`;
    els.btnApple.href = `https://music.apple.com/us/search?term=${query}`;
    els.btnYoutube.href = `https://www.youtube.com/results?search_query=${query} full album`;
    els.btnQobuz.href = `https://www.qobuz.com/us-en/search?q=${query}`;
    
    els.streamingRow.style.display = "flex";
}

// --- Events ---
els.btnRandom.onclick = () => {
    const pool = getFilteredPool();
    if (pool.length === 0) { els.txtAlbumDetails.textContent = "No albums found. Re-adjust filters!"; return; }
    
    const rIdx = Math.floor(Math.random() * pool.length);
    displayAlbum(pool[rIdx]);
};

els.btnSelectAll.onclick = () => { state.descriptors.forEach((_, k) => state.descriptors.set(k, true)); renderDescList(els.txtSearchDesc.value); updateMatches(); };
els.btnDeselectAll.onclick = () => { state.descriptors.forEach((_, k) => state.descriptors.set(k, false)); renderDescList(els.txtSearchDesc.value); updateMatches(); };
els.txtSearchDesc.oninput = (e) => { renderDescList(e.target.value); };

els.btnClear.onclick = () => {
    state.descriptors.forEach((_, k) => state.descriptors.set(k, true));
    els.txtSearchDesc.value = "";
    renderDescList();
    state.selectedGenre = "Any Genre";
    document.querySelectorAll('.genre-active').forEach(x => { x.style.fontWeight = 'normal'; x.classList.remove('genre-active'); });
    updateMatches();
};

els.txtAlbumSearch.oninput = (e) => {
    els.lstSearchResults.innerHTML = '';
    const q = e.target.value.toLowerCase().trim();
    if (!q) return;
    
    const res = state.albums.filter(a => String(a.artist_name).toLowerCase().includes(q) || String(a.release_name).toLowerCase().includes(q));
    res.slice(0, 50).forEach(a => {
        const li = document.createElement('li');
        li.textContent = getAlbumId(a);
        li.onclick = () => { displayAlbum(a); els.lstSearchResults.innerHTML = ''; els.txtAlbumSearch.value = ''; }
        els.lstSearchResults.appendChild(li);
    });
};