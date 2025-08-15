// --- Global Variables ---
        let map;
        let metadata;
        let allChurches; // Holds all features loaded from metadata
        let filteredChurches = []; // Holds currently filtered features for the list
        let sourceLayerId = 'parishes'; // Default, will be updated from metadata
        const churchLayerId = 'churches-layer';
        const clusterLayerId = 'clusters';
        const clusterCountLayerId = 'cluster-count';

        // API Configuration - Your Render server URL (made global)
        const API_BASE_URL = 'https://churches-in-the-world.onrender.com';
        
        // Make API_BASE_URL globally available for other scripts
        window.API_BASE_URL = API_BASE_URL;

        // --- Initialization ---
        document.addEventListener('DOMContentLoaded', function() {
            initMap();
            setupPanelControls();
            setupFilterListeners();
            setupListSearch();
            initPanels(); // Initial panel visibility based on screen size
        });

        function initMap() {
            fetch(`${API_BASE_URL}/metadata`)
                .then(response => response.json())
                .then(meta => {
                    metadata = meta;
                    sourceLayerId = metadata.vector_layers ? metadata.vector_layers[0].id : 'parishes';
                    
                    map = new maplibregl.Map({
                        container: 'map',
                        style: {
                            version: 8,
                            sources: {
                                // CartoDB Dark - Full zoom coverage (0-20), no rate limits
                                carto_dark: {
                                    type: 'raster',
                                    tiles: [
                                        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                                    ],
                                    tileSize: 256,
                                    attribution: '© CARTO © OpenStreetMap contributors',
                                    subdomains: ['a', 'b', 'c', 'd'],
                                    minzoom: 0,
                                    maxzoom: 20
                                },
                                // Stadia Dark (backup option)
                                stadia_dark: {
                                    type: 'raster',
                                    tiles: [
                                        'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
                                    ],
                                    tileSize: 256,
                                    attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap contributors',
                                    minzoom: 0,
                                    maxzoom: 20
                                },
                                // OpenStreetMap (always reliable)
                                osm: {
                                    type: 'raster',
                                    tiles: [
                                        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                                    ],
                                    tileSize: 256,
                                    attribution: '© OpenStreetMap contributors',
                                    subdomains: ['a', 'b', 'c'],
                                    minzoom: 0,
                                    maxzoom: 19
                                },
                                parishes: {
                                    type: 'vector',
                                    tiles: [`${API_BASE_URL}/tiles/{z}/{x}/{y}`],
                                    minzoom: metadata.minzoom || 0,
                                    maxzoom: metadata.maxzoom || 16,
                                    attribution: metadata.attribution || '',
                                    cluster: true,
                                    clusterMaxZoom: 18,
                                    clusterRadius: 100
                                }
                            },
                            layers: [
                                // Start with CartoDB dark (most reliable)
                                { id: 'base-tiles', type: 'raster', source: 'carto_dark' }
                            ],
                            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
                        },
                        center: [0, 0],
                        zoom: metadata.minzoom,
                        worldCopyJump: true
                    });

                    // --- Map Controls ---
                    map.addControl(new maplibregl.NavigationControl(), 'top-left');
                    const geolocateControl = new maplibregl.GeolocateControl({
                        positionOptions: { enableHighAccuracy: true },
                        trackUserLocation: true,
                        showUserHeading: true
                    });
                    map.addControl(geolocateControl, 'top-left');

                    // Add enhanced style switcher
                    addDarkStyleSwitcher();

                    // --- Map Event Listeners ---
                    map.on('load', onMapLoad);
                    map.on('idle', onMapIdle);
                    map.on('click', churchLayerId, handleFeatureClick);
                    map.on('click', clusterLayerId, handleClusterClick);
                    map.on('mouseenter', churchLayerId, () => map.getCanvas().style.cursor = 'pointer');
                    map.on('mouseleave', churchLayerId, () => map.getCanvas().style.cursor = '');
                    map.on('mouseenter', clusterLayerId, () => map.getCanvas().style.cursor = 'pointer');
                    map.on('mouseleave', clusterLayerId, () => map.getCanvas().style.cursor = '');

                    // Link "My Location" button to MapLibre control
                    document.getElementById('action-my-location')?.addEventListener('click', () => {
                        geolocateControl.trigger();
                        hideMobileMenu();
                    });

                })
                .catch(error => {
                    console.error('Error loading metadata:', error);
                });
        }

        function addDarkStyleSwitcher() {
            class DarkStyleSwitcher {
                onAdd(map) {
                    this._map = map;
                    this._container = document.createElement('div');
                    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
                    
                    const button = document.createElement('button');
                    button.innerHTML = '🌙';
                    button.title = 'Switch Dark Style';
                    button.style.cssText = 'font-size: 16px; width: 30px; height: 30px; border: none; background: white; cursor: pointer;';
                    
                    button.addEventListener('click', () => {
                        const currentStyle = this._map.getStyle();
                        const currentSource = currentStyle.layers[0].source;
                        
                        let newSource;
                        switch(currentSource) {
                            case 'carto_dark':
                                newSource = 'stadia_dark';
                                break;
                            case 'stadia_dark':
                                newSource = 'osm';
                                break;
                            case 'osm':
                                newSource = 'carto_dark';
                                break;
                            default:
                                newSource = 'carto_dark';
                        }
                        
                        this._map.removeLayer('base-tiles');
                        this._map.addLayer({
                            id: 'base-tiles',
                            type: 'raster',
                            source: newSource
                        }, churchLayerId);
                    });
                    
                    this._container.appendChild(button);
                    return this._container;
                }

                onRemove() {
                    this._container.parentNode.removeChild(this._container);
                    this._map = undefined;
                }
            }

            map.addControl(new DarkStyleSwitcher(), 'top-left');
        }

        function onMapLoad() {
            // Load custom icons
            map.loadImage('cathedral-icon.png', (error, image) => {
                if (error) { console.error('Error loading cathedral-icon:', error); return; }
                if (!map.hasImage('cathedral-icon')) map.addImage('cathedral-icon', image);

                map.loadImage('monument-icon.png', (error, image) => {
                    if (error) { console.error('Error loading monument-icon:', error); return; }
                    if (!map.hasImage('monument-icon')) map.addImage('monument-icon', image);

                    map.loadImage('church-icon.png', (error, image) => {
                        if (error) { console.error('Error loading church-icon:', error); return; }
                        if (!map.hasImage('church-icon')) map.addImage('church-icon', image);

                    addMapLayers();
                    });
                });
            });
        }

        function addMapLayers() {
             // Layer for clustered points (circles)
           map.addLayer({
                id: clusterLayerId,
                type: 'circle',
                source: 'parishes',
                'source-layer': sourceLayerId,
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': [
                        'step', ['get', 'point_count'],
                        '#fef3c7',   // 1-9 (light yellow)
                        10, '#fde68a',   // 10-49 (yellow)
                        50, '#fbbf24',   // 50-99 (amber)
                        100, '#f59e0b',  // 100-199 (orange)
                        200, '#d97706',  // 200-499 (dark orange)
                        500, '#b45309'   // 500+ (brown)
                    ],
                    'circle-radius': [
                        'step', ['get', 'point_count'],
                        10, // radius for < 10 points
                        10, 6, // radius for 10-49 points
                        50, 7, // radius for 50-99 points
                        100, 8, // radius for 100-199 points
                        200, 9, // radius for 200-499 points
                        500, 10  // radius for 500+ points
                    ],
                    'circle-stroke-color': '#fff',
                    'circle-stroke-width': 1,
                    'circle-opacity': 0.85
                }
            });

            // Layer for cluster counts (text)
            map.addLayer({
                id: clusterCountLayerId,
                type: 'symbol',
                source: 'parishes',
                'source-layer': sourceLayerId,
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['Noto Sans Regular'],
                    'text-size': 8,
                    'text-allow-overlap': true
                },
                paint: {
                    'text-color': '#000000'
                }
            });

            // Layer for unclustered points (individual churches)
            map.addLayer({
                id: churchLayerId,
                type: 'symbol',
                source: 'parishes',
                'source-layer': sourceLayerId,
                filter: ['!', ['has', 'point_count']],
                layout: {
                    'icon-image': [
                    'case',
                    ['>=', ['index-of', 'basilica', ['downcase', ['get', 'Type']]], 0], 'cathedral-icon',
                    ['>=', ['index-of', 'cathedral', ['downcase', ['get', 'Type']]], 0], 'cathedral-icon',
                    ['>=', ['index-of', 'monument', ['downcase', ['get', 'Title']]], 0], 'monument-icon',
                    'church-icon' // default icon
                    ],
                    'icon-size': 0.05,
                    'icon-allow-overlap': false,
                    'icon-ignore-placement': false,
                    'icon-anchor': 'bottom'
                },
                paint: {
                    // Add paint properties if needed
                }
            });
        }

        function onMapIdle() {
            // This function is called when the map settles after movement or zooming.
        }

        // --- Feature Interaction ---
        function handleFeatureClick(e) {
            if (!e.features || !e.features.length) return;
            const feature = e.features[0];
            const coordinates = feature.geometry.coordinates.slice();
            const properties = feature.properties;

            // Extract city from address if not present
            let city = properties.City || 'N/A';
            if ((city === 'N/A' || !city) && properties.Address) {
                 const addressParts = properties.Address.split(',');
                 if (addressParts.length >= 2) {
                     city = addressParts[addressParts.length - 2].trim();
                 } else if (addressParts.length === 1) {
                     city = addressParts[0].trim();
                 }
            }

            const popupContent = `
                <div class="pope-card" >
                    <strong class="pope-card-header">${properties.Title || 'Unnamed Parish'}</strong><br>
                    Jurisdiction: ${properties.Jurisdiction || ''}<br>
                    Type: ${properties.Type || ''}<br>
                    Rite: ${properties.Rite}<br>
                    City: ${city}<br>
                    Country: ${properties.Country || ''}<br>
                    Address: ${properties.Address || ''}
                </div>`;

            new maplibregl.Popup()
                .setLngLat(coordinates)
                .setHTML(popupContent)
                .addTo(map);

            highlightChurchInList(feature.id);
        }

        function handleClusterClick(e) {
             if (!e.features || !e.features.length) return;
             const features = map.queryRenderedFeatures(e.point, { layers: [clusterLayerId] });
             if (!features.length) return;

             map.easeTo({
                 center: features[0].geometry.coordinates,
                 zoom: map.getZoom() + 2
             });
        }

        // --- Data Querying and List Population ---
        function highlightChurchInList(id) {
            document.querySelectorAll('.church-item').forEach(item => item.style.backgroundColor = '');
            const targetItem = document.getElementById('church-item-' + id);
            if (targetItem) {
                targetItem.style.backgroundColor = '#e6f0ff';
                const listContainer = document.getElementById('church-list');
                if (listContainer) {
                    const itemRect = targetItem.getBoundingClientRect();
                    const containerRect = listContainer.getBoundingClientRect();
                    if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
                         targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }
            }
        }

        // --- Filtering Logic ---
        function setupFilterListeners() {
            document.getElementById('title-search')?.addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('city-search')?.addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('country-search')?.addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('jurisdiction-search')?.addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('type-search')?.addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('rite-search')?.addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('reset-filters')?.addEventListener('click', resetFilters);
        }
        
        let filters = {
            title: '',
            country: '',
            type: '',
            address: '',
            rite: '',
            jurisdiction: ''
        };

        let churchdata  = [];

		function applyFilters() {
			 filters = {
				title: document.getElementById('title-search')?.value.trim().toLowerCase() || '',
				country: document.getElementById('country-search')?.value.trim().toLowerCase() || '',
				type: document.getElementById('type-search')?.value.trim().toLowerCase() || '',
				address: document.getElementById('city-search')?.value.trim().toLowerCase() || '',
				rite: document.getElementById('rite-search')?.value.trim().toLowerCase() || '',
				jurisdiction: document.getElementById('jurisdiction-search')?.value.trim().toLowerCase() || ''
			};

			updateMapFilter(filters);
		}
		
		async function updateMapFilter(filters) {
			const filterExpressions = ['all'];

			if (filters.title) {
				filterExpressions.push([
					'in',
					filters.title.toLowerCase(),
					['downcase', ['to-string', ['get', 'Title']]]
				]);
			}

			if (filters.country) {
				filterExpressions.push([
					'in',
					filters.country.toLowerCase(),
					['downcase', ['to-string', ['get', 'Country']]]
				]);
			}

			if (filters.type) {
				filterExpressions.push([
					'in',
					filters.type.toLowerCase(),
					['downcase', ['to-string', ['get', 'Type']]]
				]);
			}
			
			if (filters.address) {
				filterExpressions.push([
					'in',
					filters.address.toLowerCase(),
					['downcase', ['to-string', ['get', 'Address']]]
				]);
			}

			if (filters.rite) {
				filterExpressions.push([
					'in',
					filters.rite.toLowerCase(),
					['downcase', ['to-string', ['get', 'Rite']]]
				]);
			}

			if (filters.jurisdiction) {
				filterExpressions.push([
					'in',
					filters.jurisdiction.toLowerCase(),
					['downcase', ['to-string', ['get', 'Jurisdiction']]]
				]);
			}

			map.setFilter(churchLayerId, filterExpressions);
			map.setFilter(clusterCountLayerId, filterExpressions);
			map.setFilter(clusterLayerId, filterExpressions);

            const query = new URLSearchParams(filters);

            try {
                const response = await fetch(`${API_BASE_URL}/filter?${query.toString()}`);
                churchdata = await response.json();
                ChurchesManager.populateChurchList(churchdata.churches, churchdata.pagination);
                zoomToFiltered(churchdata.churches);
            } catch (error) {
                console.error('Error applying filters:', error);
            }
		}

        async function resetFilters() {
            console.log("Resetting filters");
            document.getElementById('title-search').value = '';
            document.getElementById('city-search').value = '';
            document.getElementById('country-search').value = '';
            document.getElementById('jurisdiction-search').value = '';
            document.getElementById('type-search').value = '';
            document.getElementById('rite-search').value = '';
            
            try {
                const response = await fetch(`${API_BASE_URL}/churches?page=1&limit=500`);
                const data = await response.json();
                ChurchesManager.populateChurchList(data.churches, data.pagination);
                applyFilters();
            } catch (error) {
                console.error('Error resetting filters:', error);
            }
        }

        function zoomToFiltered(features) {
            if (!map || !Array.isArray(features) || features.length === 0) return;

            const bounds = new maplibregl.LngLatBounds();

            features.forEach(feature => {
                if (feature.geometry && feature.geometry.type === 'Point') {
                    bounds.extend(feature.geometry.coordinates);
                }
            });

            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, {
                    padding: 50,
                    maxZoom: 14
                });
            }
        }

        // --- UI Panel and Controls ---
        function setupPanelControls() {
            const quickActionsBtn = document.getElementById('mobile-quick-actions');
            const menu = document.getElementById('mobile-actions-menu');
            if (quickActionsBtn && menu) {
                quickActionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (menu.classList.contains('visible')) {
                        hideMobileMenu();
                    } else {
                        menu.style.display = 'flex';
                        void menu.offsetWidth;
                        menu.classList.add('visible');
                        quickActionsBtn.textContent = '×';
                        updateMobileMenuIndicators();
                    }
                });
                document.addEventListener('click', (e) => {
                     if (!menu.contains(e.target) && e.target !== quickActionsBtn) {
                         hideMobileMenu();
                     }
                });
            }

            document.querySelectorAll('.mobile-action-item').forEach(item => {
                item.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const panelId = this.getAttribute('data-panel');
                    const contentId = this.getAttribute('data-content');

                    if (panelId && contentId) {
                        togglePanelVisibility(panelId, contentId);
                    } else if (this.id === 'action-hide-all-panels') {
                        hideAllPanels();
                    }

                    hideMobileMenu();
                });
            });

             const hideListBtn = document.getElementById('hide-church-list');
             if (hideListBtn) {
                 hideListBtn.addEventListener('click', () => {
                     const panel = document.getElementById('church-list-panel');
                     if (panel) panel.style.display = 'none';
                 });
             }
        }

        function hideMobileMenu() {
            const menu = document.getElementById('mobile-actions-menu');
            const quickActionsBtn = document.getElementById('mobile-quick-actions');
            if (menu && menu.classList.contains('visible')) {
                menu.classList.remove('visible');
                if(quickActionsBtn) quickActionsBtn.textContent = '+';
                setTimeout(() => { menu.style.display = 'none'; }, 300);
            }
        }

        function updateMobileMenuIndicators() {
             document.querySelectorAll('.mobile-action-item[data-panel]').forEach(item => {
                 const panelId = item.getAttribute('data-panel');
                 const panel = document.getElementById(panelId);
                 const indicator = item.querySelector('.panel-visibility-indicator');
                 if (panel && indicator) {
                     indicator.style.display = (panel.style.display !== 'none') ? 'block' : 'none';
                 }
             });
        }

       function togglePanel(contentId) {
            if (event && event.target.classList.contains('close-button')) {
                return;
            }

            const content = document.getElementById(contentId);
            if (!content) return;
            const panel = content.closest('.panel');
            const toggleBtn = panel ? panel.querySelector('.toggle-btn') : null;

            if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                content.style.display = 'block';
                if (toggleBtn) toggleBtn.textContent = '−';
            } else {
                content.classList.add('collapsed');
                content.style.display = 'none';
                if (toggleBtn) toggleBtn.textContent = '+';
            }
        }

        function togglePanelVisibility(panelId, contentId) {
            const panel = document.getElementById(panelId);
            if (!panel) return;

            if (panel.style.display === 'none' || !panel.style.display) {
                if (panelId === "church-list-panel"){
                        const filterPanel = document.getElementById("filter-panel");
                        if (filterPanel) filterPanel.style.display = 'none';

                        const legendPanel = document.getElementById("legend");
                        if (legendPanel) legendPanel.style.display = 'none';

                        panel.style.display = 'block';

                        const content = document.getElementById(contentId);
                        if (content && content.classList.contains('collapsed')) {
                            togglePanel(contentId);
                        }

                } else if (panelId === "filter-panel") {
                        const listPanel = document.getElementById("church-list-panel");
                        if (listPanel) listPanel.style.display = 'none';
                        const legendPanel = document.getElementById("legend");
                        if (legendPanel) legendPanel.style.display = 'none';

                        panel.style.display = 'block';

                        const content = document.getElementById(contentId);
                        if (content && content.classList.contains('collapsed')) {
                            togglePanel(contentId);
                        }
                } else {
                        const filterPanel = document.getElementById("filter-panel");
                        if (filterPanel) filterPanel.style.display = 'none';
                        const listPanel = document.getElementById("church-list-panel");
                        if (listPanel) listPanel.style.display = 'none';

                        panel.style.display = 'block';

                        const content = document.getElementById(contentId);
                        if (content && content.classList.contains('collapsed')) {
                            togglePanel(contentId);
                        }
                }

            } else {
                panel.style.display = 'none';
            }
            updateMobileMenuIndicators();
        }

         function hideAllPanels() {
             document.querySelectorAll('.panel').forEach(panel => {
                 panel.style.display = 'none';
             });
             updateMobileMenuIndicators();
         }

        function initPanels() {
            document.querySelectorAll('.panel-content').forEach(content => {
                 if (!content.classList.contains('collapsed')) {
                     content.classList.add('collapsed');
                     content.style.display = 'none';
                 }
                 const toggleBtn = content.previousElementSibling?.querySelector('.toggle-btn');
                 if (toggleBtn) toggleBtn.textContent = '+';
            });

             if (window.innerWidth >= 768) {
                 // Desktop specific overrides if needed
             }
        }

        // --- Searchable Dropdowns ---
        function setupSearchableDropdown(inputId, items) {
            const input = document.getElementById(inputId);
            const suggestionsContainerId = inputId + '-suggestions';
            let suggestionsContainer = document.getElementById(suggestionsContainerId);

            if (!input) return;

            if (!suggestionsContainer) {
                suggestionsContainer = document.createElement('div');
                suggestionsContainer.className = 'dropdown-list';
                suggestionsContainer.id = suggestionsContainerId;
                input.parentNode.appendChild(suggestionsContainer);

                suggestionsContainer.addEventListener('click', (e) => {
                    if (e.target.classList.contains('dropdown-item')) {
                        input.value = e.target.textContent === 'All' ? '' : e.target.textContent;
                        hideSuggestions(inputId);
                        applyFilters();
                    }
                });
            }

            const displaySuggestions = () => {
                const query = input.value.toLowerCase();
                const matches = items.filter(item =>
                    item && item.toLowerCase().includes(query)
                ).slice(0, 10);

                suggestionsContainer.innerHTML = '';

                const allItem = document.createElement('div');
                allItem.className = 'dropdown-item';
                allItem.textContent = 'All';
                suggestionsContainer.appendChild(allItem);

                matches.forEach(itemText => {
                    const element = document.createElement('div');
                    element.className = 'dropdown-item';
                    element.textContent = itemText;
                    suggestionsContainer.appendChild(element);
                });
                suggestionsContainer.style.display = 'block';
            };

            input.addEventListener('input', debounce(displaySuggestions, 200));
            input.addEventListener('focus', displaySuggestions);
            input.addEventListener('blur', () => setTimeout(() => hideSuggestions(inputId), 150));
        }

        function hideSuggestions(inputId) {
            const suggestions = document.getElementById(inputId + '-suggestions');
            if (suggestions) {
                suggestions.style.display = 'none';
            }
        }

        // --- List Search ---
        function setupListSearch() {
            const searchInput = document.getElementById('list-search');
            if (!searchInput) return;

            searchInput.addEventListener('input', debounce(function() {
                const query = this.value.toLowerCase();
                document.querySelectorAll('#church-list .church-item').forEach(item => {
                    const title = item.querySelector('.church-title')?.textContent.toLowerCase() || '';
                    const details = item.querySelector('.church-details')?.textContent.toLowerCase() || '';
                    item.style.display = (title.includes(query) || details.includes(query)) ? '' : 'none';
                });
            }, 200));
        }

        // --- Utility Functions ---
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func.apply(this, args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
