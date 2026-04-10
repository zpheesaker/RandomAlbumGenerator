// Core state values for filter & random album UI
const state = {
    albums: [],
    descriptors: new Map(), // Checkbox state for descriptors
    genres: new Map(), // Checkbox state for genres
    validGenres: new Set(),
    currentAlbum: null,
    isAnyGenre: true
};

// UI Elements
const els = {
    tree: document.getElementById('genreTree'),
    txtSearchDesc: document.getElementById('txtSearchDescriptors'),
    txtSearchGenres: document.getElementById('txtSearchGenres'),
    btnSelectAll: document.getElementById('btnSelectAll'),
    btnDeselectAll: document.getElementById('btnDeselectAll'),
    btnSelectAllGenres: document.getElementById('btnSelectAllGenres'),
    btnDeselectAllGenres: document.getElementById('btnDeselectAllGenres'),
    descList: document.getElementById('descriptorList'),
    btnRandom: document.getElementById('btnRandom'),
    btnListAll: document.getElementById('btnListAll'),
    btnApply: document.getElementById('btnApply'),
    btnClear: document.getElementById('btnClear'),
    lblMatchCount: document.getElementById('lblMatchCount'),
    lblAppliedFilters: document.getElementById('lblAppliedFilters'),
    appliedFiltersWrapper: document.getElementById('appliedFiltersWrapper'),
    appliedFilterCount: document.getElementById('appliedFilterCount'),
    matchedAlbumsWrapper: document.getElementById('matchedAlbumsWrapper'),
    lstMatchedAlbums: document.getElementById('lstMatchedAlbums'),
    txtAlbumSearch: document.getElementById('txtAlbumSearch'),
    lstSearchResults: document.getElementById('lstSearchResults'),
    txtAlbumDetails: document.getElementById('txtAlbumDetails'),
    streamingRow: document.getElementById('streamingLinks'),
    btnSpotify: document.getElementById('btnSpotify'),
    btnApple: document.getElementById('btnApple'),
    btnYoutube: document.getElementById('btnYoutube'),
    btnQobuz: document.getElementById('btnQobuz'),
    
    // Hamburger Menu elements
    btnOpenMenu: document.getElementById('btnOpenMenu'),
    btnCloseMenu: document.getElementById('btnCloseMenu'),
    filterOverlay: document.getElementById('filterOverlay'),
    filterDrawer: document.getElementById('filterDrawer'),
    tabGenres: document.getElementById('tabGenres'),
    tabDesc: document.getElementById('tabDesc'),
    secGenres: document.getElementById('secGenres'),
    secDesc: document.getElementById('secDesc'),
    chkDescMatchAll: document.getElementById('chkDescMatchAll'),
    chkDescFlat: document.getElementById('chkDescFlat')
};

function getAlbumId(a) { return `${a.artist_name} - ${a.release_name}`; }

// --- Initialization ---
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const [csvRes, jsonRes, descRes, descJsonRes] = await Promise.all([
            fetch('Data/rym_clean1.csv'),
            fetch('Data/filtered_hierarchy.json'),
            fetch('Data/descriptors_reference.csv'),
            fetch('Data/descriptors_hierarchy.json')
        ]);
        
        if (!csvRes.ok || !jsonRes.ok || !descRes.ok || !descJsonRes.ok) {
            throw new Error("HTTP Error loading one or more Data/ files.");
        }
        
        const csvText = await csvRes.text();
        const hierarchy = await jsonRes.json();
        const descText = await descRes.text();
        const descHierarchy = await descJsonRes.json();

        // Move "Scenes & Movements" under "Genres" if it exists at root
        if (hierarchy && hierarchy.children) {
            const gNode = hierarchy.children.find(c => c.name === "Genres");
            const sIdx = hierarchy.children.findIndex(c => c.name === "Scenes & Movements");
            if (gNode && sIdx > -1) {
                const sNode = hierarchy.children.splice(sIdx, 1)[0];
                gNode.children.push(sNode);
            }
        }

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
                        
                        // Seed all genres from tree to map
                        function seedGenres(n) {
                            if (n.name !== "Root" && n.name !== "Genres" && n.name !== "Any Genre") {
                                state.genres.set(n.name, true); // default true for Any
                            }
                            if (n.children) n.children.forEach(c => seedGenres(c));
                        }
                        seedGenres(hierarchy);
                        state.hierarchy = hierarchy;
                        
                        /* 
                        function seedDescTree(n) {
                            if (n.name !== "Root" && n.count > 0) {
                                state.descriptors.set(n.name, true); // Overwrite lowercase keys with exact casing from tree where count > 0
                            }
                            if (n.children) n.children.forEach(c => seedDescTree(c));
                        }
                        */
                        state.descHierarchy = descHierarchy;
                        // seedDescTree(state.descHierarchy);
                        
                        renderDescriptors();
                        renderTree(state.hierarchy, els.tree);
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
    // If all genres are true, it's any genre
    let allG = true; let anyG = false;
    state.genres.forEach(val => { if (!val) allG = false; else anyG = true; });
    state.isAnyGenre = allG;
    
    state.validGenres.clear();
    if (!state.isAnyGenre) {
        state.genres.forEach((val, key) => {
            if (val) state.validGenres.add(key.toLowerCase());
        });
    }
    
    const activeDesc = new Set();
    state.descriptors.forEach((val, key) => { if (val) activeDesc.add(key); });
    
    const matchAllDesc = els.chkDescMatchAll.checked;

    return state.albums.filter(a => {
        // Genre Match
        if (!state.isAnyGenre) {
            let gMatch = false;
            for (let g of a._gSet) {
                if (state.validGenres.has(g)) { gMatch = true; break; }
            }
            if (!gMatch) return false;
        }
        
        // Desc Match
        if (activeDesc.size > 0) {
            if (matchAllDesc) {
                // Must have all active descriptors
                for (let desc of activeDesc) {
                    if (!a._dSet.has(desc)) return false;
                }
            } else {
                // Match Any
                let dMatch = false;
                for (let d of a._dSet) {
                    if (activeDesc.has(d)) { dMatch = true; break; }
                }
                if (!dMatch) return false;
            }
        }
        
        return true;
    });
}

function updateMatches() {
    const pool = getFilteredPool();
    els.lblMatchCount.textContent = pool.length;
    
    // Update Applied Filters Label
    els.lblAppliedFilters.innerHTML = '';
    let filterCount = 0;
    
    let hasDesc = false;
    let activeDescCount = 0;
    state.descriptors.forEach(val => { if(val) { hasDesc = true; activeDescCount++; } });
    const totalDesc = state.descriptors.size;

    if (state.isAnyGenre && !hasDesc) {
        els.appliedFiltersWrapper.style.display = 'none';
        els.appliedFiltersWrapper.removeAttribute('open');
    } else {
        els.appliedFiltersWrapper.style.display = 'block';
        
        let chipsRendered = 0;
        const maxChips = 15;

        // Render Genre Chips
        if (state.isAnyGenre) {
            const span = document.createElement('span');
            span.className = 'filter-chip';
            span.textContent = 'All Genres';
            els.lblAppliedFilters.appendChild(span);
            filterCount++;
            chipsRendered++;
        } else {
            state.genres.forEach((val, key) => {
                if (val) {
                    if (chipsRendered < maxChips) {
                        const span = document.createElement('span');
                        span.className = 'filter-chip';
                        span.textContent = key;
                        els.lblAppliedFilters.appendChild(span);
                    }
                    filterCount++;
                    chipsRendered++;
                }
            });
        }
        
        // Render Descriptor Chips
        if (activeDescCount === totalDesc && totalDesc > 0) {
            const span = document.createElement('span');
            span.className = 'filter-chip';
            span.textContent = 'All Descriptors';
            span.style.color = '#e2e8f0';
            span.style.borderColor = '#444';
            els.lblAppliedFilters.appendChild(span);
            filterCount++;
            chipsRendered++;
        } else {
            state.descriptors.forEach((val, key) => {
                if (val) {
                    if (chipsRendered < maxChips) {
                        const span = document.createElement('span');
                        span.className = 'filter-chip';
                        span.textContent = key + (els.chkDescMatchAll.checked ? ' (AND)' : '');
                        span.style.color = '#e2e8f0'; // differentiate descriptors slightly
                        span.style.borderColor = '#444';
                        els.lblAppliedFilters.appendChild(span);
                    }
                    filterCount++;
                    chipsRendered++;
                }
            });
        }
        
        if (chipsRendered > maxChips) {
            const overflow = chipsRendered - maxChips;
            const span = document.createElement('span');
            span.className = 'filter-chip';
            span.textContent = `+ ${overflow} more`;
            span.style.background = '#2a2a2c';
            els.lblAppliedFilters.appendChild(span);
        }
        
        els.appliedFilterCount.textContent = filterCount;
    }

    // Close matched list if open when filters change
    els.matchedAlbumsWrapper.removeAttribute('open');

    updateVisibility();
}

function updateVisibility() {
    const activeDesc = new Set();
    state.descriptors.forEach((val, key) => { if (val) activeDesc.add(key); });
    const matchAllDesc = els.chkDescMatchAll.checked;
    
    // Calculate what's available
    const availableGenres = new Set();
    const availableDesc = new Set();

    state.albums.forEach(a => {
        // 1. Can this album provide Genres? (Needs to match Descriptor rules)
        let descMatch = true;
        if (activeDesc.size > 0) {
            if (matchAllDesc) {
                for (let desc of activeDesc) { if (!a._dSet.has(desc)) { descMatch = false; break; } }
            } else {
                descMatch = false;
                for (let d of a._dSet) { if (activeDesc.has(d)) { descMatch = true; break; } }
            }
        }
        if (descMatch) {
            a._gSet.forEach(g => availableGenres.add(g));
        }

        // 2. Can this album provide Descriptors? (Needs to match Genre rules AND active descriptors if match-all)
        let gMatch = true;
        if (!state.isAnyGenre) {
            gMatch = false;
            for (let g of a._gSet) { if (state.validGenres.has(g)) { gMatch = true; break; } }
        }
        
        if (gMatch) {
            if (matchAllDesc && activeDesc.size > 0) {
                // If it's Match All, this album must have ALL active descriptors to be a candidate for more
                let matchesCurrentActive = true;
                for (let desc of activeDesc) {
                    if (!a._dSet.has(desc)) { matchesCurrentActive = false; break; }
                }
                if (matchesCurrentActive) {
                    a._dSet.forEach(d => availableDesc.add(d));
                }
            } else {
                // Match Any: just needs to match genre category
                a._dSet.forEach(d => availableDesc.add(d));
            }
        }
    });

    // Grey Out Genres
    els.tree.querySelectorAll('.genre-chk').forEach(chk => {
        const genreName = chk.dataset.genreName;
        const row = chk.closest('.tree-row');
        const key = genreName.toLowerCase();
        const isAvailable = availableGenres.has(key);
        
        if (!isAvailable && !chk.checked) {
            if (row) {
                row.style.color = '#6b7280';
                row.style.fontStyle = 'italic';
            }
        } else {
            if (row) {
                row.style.color = '';
                row.style.fontStyle = '';
            }
        }
    });

    // Grey Out Descriptors
    els.descList.querySelectorAll('.desc-chk').forEach(chk => {
        const descKey = chk.dataset.descKey;
        const row = chk.closest('.tree-row'); 
        const lbl = chk.closest('label'); // Valid for flat view
        
        let keyToMatch = descKey || chk.parentNode.textContent.trim(); // Fallback for flat layout label
        const isAvailable = availableDesc.has(keyToMatch);
        
        if (!isAvailable && !chk.checked) {
            if (row) {
                row.style.color = '#6b7280';
                row.style.fontStyle = 'italic';
            }
            if (lbl) {
                lbl.style.color = '#6b7280';
                lbl.style.fontStyle = 'italic';
            }
        } else {
            if (row) {
                row.style.color = '';
                row.style.fontStyle = '';
            }
            if (lbl) {
                lbl.style.color = '#e2e8f0'; // ensure label is white, not the default label gray
                lbl.style.fontStyle = '';
            }
        }
    });
}

// --- Renderers ---
function renderDescriptors() {
    const val = els.txtSearchDesc.value;
    if (els.chkDescFlat.checked) {
        renderDescList(val);
    } else {
        els.descList.innerHTML = '';
        renderDescTree(state.descHierarchy, els.descList, val);
    }
    // Re-apply cross-filter visibility to the freshly built DOM
    updateVisibility();
}

function renderDescList(filterStr = "") {
    els.descList.innerHTML = '';
    const q = filterStr.toLowerCase();
    
    // Just use the exact CSV keys populated during initialize
    const exactKeys = Array.from(state.descriptors.keys());
    exactKeys.sort().forEach(d => {
        if (!d.includes(q)) return;
        
        const lbl = document.createElement('label');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'desc-chk';
        chk.checked = state.descriptors.get(d);
        chk.onchange = e => {
            const val = e.target.checked;
            state.descriptors.set(d, val);
            updateMatches();
        };
        lbl.className = 'check-box-label';
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(" " + d));
        // Add styling so it looks okay flat
        lbl.style.display = "flex";
        lbl.style.padding = "2px 4px";
        lbl.style.cursor = "pointer";
        lbl.style.margin = "0"; // override default check-box-label margin for compactness
        lbl.style.color = '#e2e8f0'; // ensure it visually matches tree row elements on spawn
        
        els.descList.appendChild(lbl);
    });
}

function renderTree(node, container, filterStr = "") {
    const q = filterStr.toLowerCase();

    function buildNode(n, containerObj) {
        if (n.name === "Root") {
            n.children.forEach(c => buildNode(c, containerObj));
            return;
        }

        // Check search match
        let hasMatch = n.name.toLowerCase().includes(q);
        function checkChildrenMatch(cn) {
            if (cn.name.toLowerCase().includes(q)) return true;
            if (cn.children) return cn.children.some(checkChildrenMatch);
            return false;
        }
        if (q && !hasMatch && n.children) hasMatch = checkChildrenMatch(n);
        
        // Display logic for searching
        if (q && !hasMatch) return; // skip if doesn't match and children dont match

        const isParent = n.children && n.children.length > 0;
        const wrp = isParent ? document.createElement('details') : document.createElement('div');
        if (isParent) wrp.open = Boolean(q); // Auto open if searching
        if (n.name === "Genres") wrp.open = true;
        
        // Add auto-expand logic for children when user expands parent
        if (isParent && n.name !== "Genres") {
            wrp.addEventListener('toggle', (e) => {
                if (wrp.open) {
                    wrp.querySelectorAll('details').forEach(childDet => {
                        childDet.open = true;
                    });
                }
            });
        }
        
        const header = isParent ? document.createElement('summary') : document.createElement('div');
        if (!isParent) header.className = "tree-row-leaf";
        
        const row = document.createElement('div');
        row.className = 'tree-row';
        const labelSpan = document.createElement('span');
        labelSpan.textContent = n.name;
        row.appendChild(labelSpan);
        
        // Setup checkbox on Top Level "Genres"
        if (n.name !== "Genres" && n.name !== "Any Genre") {
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'genre-chk';
            chk.dataset.genreName = n.name;
            chk.checked = state.genres.get(n.name) || false;
            
            // Checkbox logic: If checked/unchecked, affect it and ALL its children recursively!
            chk.onchange = e => {
                const val = e.target.checked;
                
                // Toggle self
                state.genres.set(n.name, val);
                
                // Toggle children recursively
                function toggleChildren(childNode) {
                    if (childNode.name !== "Genres" && childNode.name !== "Any Genre") {
                        state.genres.set(childNode.name, val);
                    }
                    if (childNode.children) childNode.children.forEach(toggleChildren);
                }
                if (n.children) toggleChildren(n);

                updateMatches();
                
                // Instead of completely clearing and re-rendering DOM (which resets open/closed `<details>`),
                // Sync the actual DOM checkboxes manually so that your manually opened dropdowns stay exactly as they were!
                document.querySelectorAll('.genre-chk').forEach(el => {
                    if (state.genres.has(el.dataset.genreName)) {
                        el.checked = state.genres.get(el.dataset.genreName);
                    }
                });
            };
            
            // Do not toggle expand/collapse when checking the box itself!
            chk.onclick = e => e.stopPropagation();
            
            row.appendChild(chk);
        }
        
        header.appendChild(row);
        wrp.appendChild(header);
        
        if (isParent) {
            const childrenWrapper = document.createElement('div');
            n.children.forEach(c => buildNode(c, childrenWrapper));
            wrp.appendChild(childrenWrapper);
        }
        
        containerObj.appendChild(wrp);
    }
    
    container.innerHTML = '';
    buildNode(node, container);
}

function renderDescTree(node, container, filterStr = "") {
    const q = filterStr.toLowerCase();

    function buildNode(n, containerObj) {
        if (n.name === "Root" || n.name === "Descriptors") {
            if (n.children) n.children.forEach(c => buildNode(c, containerObj));
            return;
        }

        // Check search match
        let hasMatch = n.name.toLowerCase().includes(q);
        function checkChildrenMatch(cn) {
            if (cn.name.toLowerCase().includes(q)) return true;
            if (cn.children) return cn.children.some(checkChildrenMatch);
            return false;
        }
        if (q && !hasMatch && n.children) hasMatch = checkChildrenMatch(n);
        
        // Display logic for searching
        if (q && !hasMatch) return;

        const isParent = n.children && n.children.length > 0;
        const wrp = isParent ? document.createElement('details') : document.createElement('div');
        if (isParent) wrp.open = Boolean(q); // Auto open if searching
        
        // Add auto-expand logic for children when user expands parent
        if (isParent) {
            wrp.addEventListener('toggle', (e) => {
                if (wrp.open) {
                    wrp.querySelectorAll('details').forEach(childDet => {
                        childDet.open = true;
                    });
                }
            });
        }
        
        const header = isParent ? document.createElement('summary') : document.createElement('div');
        if (!isParent) header.className = "tree-row-leaf"; // reusing genre css class
        
        const row = document.createElement('div');
        row.className = 'tree-row';
        const labelSpan = document.createElement('span');
        labelSpan.textContent = n.name;
        row.appendChild(labelSpan);
        
        // Setup checkbox only if the node has a count > 0
        if (n.count && n.count > 0) {
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'desc-chk';
            chk.dataset.descKey = n.key; // Use real CSV key for tracking
            
            // Check state against the direct exact CSV key
            chk.checked = state.descriptors.get(n.key) || false;
            
            chk.onchange = e => {
                const val = e.target.checked;
                
                // Toggle self in state via true CSV key
                if (n.key) state.descriptors.set(n.key, val);
                
                // Toggle children recursively
                function toggleChildren(childNode) {
                    if (childNode.count && childNode.count > 0 && childNode.key) {
                        state.descriptors.set(childNode.key, val);
                    }
                    if (childNode.children) childNode.children.forEach(toggleChildren);
                }
                if (n.children) toggleChildren(n);

                updateMatches();
                
                // Sync the actual DOM checkboxes manually
                document.querySelectorAll('.desc-chk').forEach(el => {
                    const dk = el.dataset.descKey;
                    if (dk && state.descriptors.has(dk)) {
                        el.checked = state.descriptors.get(dk);
                    }
                });
            };
            
            chk.onclick = e => e.stopPropagation();
            row.appendChild(chk);
        }
        
        header.appendChild(row);
        wrp.appendChild(header);
        
        if (isParent) {
            const childrenWrapper = document.createElement('div');
            n.children.forEach(c => buildNode(c, childrenWrapper));
            wrp.appendChild(childrenWrapper);
        }
        
        containerObj.appendChild(wrp);
    }
    
    container.innerHTML = '';
    buildNode(node, container);
}

els.chkDescMatchAll.onchange = () => updateMatches();

els.btnListAll ? els.btnListAll.onclick = null : null; // Remove legacy button ref if any exists

let renderTimeout = null;
els.matchedAlbumsWrapper.ontoggle = () => {
    if (els.matchedAlbumsWrapper.open) {
        els.lstMatchedAlbums.innerHTML = '<li style="text-align:center;">Loading list...</li>';
        
        // Timeout to let the UI finish animating open
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            const pool = getFilteredPool();
            if (pool.length === 0) {
                els.lstMatchedAlbums.innerHTML = '<li>No matched albums to list.</li>';
                return;
            }
            
            // Sort pool by avg_rating descending
            const sorted = pool.slice().sort((a, b) => {
                const r1 = parseFloat(a.avg_rating) || 0;
                const r2 = parseFloat(b.avg_rating) || 0;
                return r2 - r1;
            });

            els.lstMatchedAlbums.innerHTML = '';
            
            // Limit render to prevent DOM freezing permanently on max lists
            const maxToRender = Math.min(sorted.length, 300); 
            
            for(let idx = 0; idx < maxToRender; idx++) {
                const album = sorted[idx];
                const li = document.createElement('li');
                li.textContent = `${idx + 1}. ${album.artist_name} - ${album.release_name}`;
                li.onclick = () => {
                    displayAlbum(album);
                    els.matchedAlbumsWrapper.removeAttribute('open');
                };
                els.lstMatchedAlbums.appendChild(li);
            }
            
            if (sorted.length > maxToRender) {
                const li = document.createElement('li');
                li.textContent = `...and ${sorted.length - maxToRender} more (refine filters to see all)`;
                li.style.textAlign = 'center';
                li.style.color = '#a0aec0';
                els.lstMatchedAlbums.appendChild(li);
            }
        }, 30); // slight delay lets the accordion visually drop down
    } else {
        // clear DOM memory when closed
        els.lstMatchedAlbums.innerHTML = '';
    }
};

// We don't need rebuildValidGenresSet anymore as genres map holds boolean and getFilteredPool builds validGenres


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
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        els.btnSpotify.href = `spotify:search:${query}`;
        els.btnApple.href = `music://search?term=${query}`;
        els.btnYoutube.href = `youtube://results?search_query=${query}+full+album`;
        els.btnQobuz.href = `https://open.qobuz.com/search?q=${query}`;
    } else {
        els.btnSpotify.href = `https://open.spotify.com/search/${query}/albums`;
        els.btnApple.href = `https://music.apple.com/us/search?term=${query}`;
        els.btnYoutube.href = `https://www.youtube.com/results?search_query=${query} full album`;
        els.btnQobuz.href = `https://www.qobuz.com/us-en/search?q=${query}`;
    }
    
    els.streamingRow.style.display = "flex";
}

// --- Events ---
els.btnRandom.onclick = () => {
    const pool = getFilteredPool();
    if (pool.length === 0) { els.txtAlbumDetails.textContent = "No albums found. Re-adjust filters!"; return; }
    
    const rIdx = Math.floor(Math.random() * pool.length);
    displayAlbum(pool[rIdx]);
};

els.btnSelectAll.onclick = () => { 
    state.descriptors.forEach((_, k) => state.descriptors.set(k, true)); 
    updateMatches(); 
    document.querySelectorAll('.desc-chk').forEach(el => el.checked = true);
};
els.btnDeselectAll.onclick = () => { 
    state.descriptors.forEach((_, k) => state.descriptors.set(k, false)); 
    updateMatches(); 
    document.querySelectorAll('.desc-chk').forEach(el => el.checked = false);
};
els.txtSearchDesc.oninput = (e) => { renderDescriptors(); };
els.chkDescFlat.onchange = () => { renderDescriptors(); };

// Genre Handlers
els.btnSelectAllGenres.onclick = () => {
    state.genres.forEach((_, k) => state.genres.set(k, true));
    updateMatches();
    document.querySelectorAll('.genre-chk').forEach(el => {
        if (state.genres.has(el.dataset.genreName)) {
            el.checked = true;
        }
    });
};
els.btnDeselectAllGenres.onclick = () => {
    state.genres.forEach((_, k) => state.genres.set(k, false));
    updateMatches();
    document.querySelectorAll('.genre-chk').forEach(el => {
        if (state.genres.has(el.dataset.genreName)) {
            el.checked = false;
        }
    });
};
els.txtSearchGenres.oninput = (e) => { els.tree.innerHTML = ''; renderTree(state.hierarchy, els.tree, e.target.value); updateVisibility(); };

els.btnClear.onclick = () => {
    state.descriptors.forEach((_, k) => state.descriptors.set(k, true));
    state.genres.forEach((_, k) => state.genres.set(k, true));
    els.txtSearchDesc.value = "";
    els.txtSearchGenres.value = "";
    
    renderDescriptors();
    els.tree.innerHTML = ''; renderTree(state.hierarchy, els.tree);
    
    state.isAnyGenre = true;
    updateMatches();
};

// Hamburger Handlers
els.btnOpenMenu.onclick = () => {
    els.filterDrawer.classList.add('open');
    els.filterOverlay.classList.add('open');
};
els.btnCloseMenu.onclick = () => {
    els.filterDrawer.classList.remove('open');
    els.filterOverlay.classList.remove('open');
};
els.btnApply.onclick = () => { els.btnCloseMenu.onclick(); els.btnRandom.onclick(); };
els.filterOverlay.onclick = els.btnCloseMenu.onclick;

// Tab Handlers
els.tabGenres.onclick = () => {
    els.tabGenres.classList.add('active'); els.secGenres.classList.add('active');
    els.tabDesc.classList.remove('active'); els.secDesc.classList.remove('active');
};
els.tabDesc.onclick = () => {
    els.tabDesc.classList.add('active'); els.secDesc.classList.add('active');
    els.tabGenres.classList.remove('active'); els.secGenres.classList.remove('active');
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