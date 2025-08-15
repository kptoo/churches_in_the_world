// --- Global Variables ---
        let map;
        let metadata;
        let allChurches; // Holds all features loaded from metadata
        let filteredChurches = []; // Holds currently filtered features for the list
        let sourceLayerId = 'parishes'; // Default, will be updated from metadata
        const churchLayerId = 'churches-layer';
        const clusterLayerId = 'clusters';
        const clusterCountLayerId = 'cluster-count';

        // --- Initialization ---
        document.addEventListener('DOMContentLoaded', function() {
            initMap();
            setupPanelControls();
            setupFilterListeners();
            setupListSearch();
            initPanels(); // Initial panel visibility based on screen size
        });

        function initMap() {
            // updateLoadingStatus removed
            fetch('https://churches.onrender.com/metadata')
                .then(response => response.json())
                .then(meta => {
                    metadata = meta;
                    sourceLayerId = metadata.vector_layers ? metadata.vector_layers[0].id : 'parishes';
                    const mapboxAccessToken = 'pk.eyJ1Ijoia2lwdG9vMDEiLCJhIjoiY202cGlvdnRhMDRxZDJrc2JpbWprN25kaCJ9.YlAHNXzq6IJ8nfoHo0gjTQ';
                    map = new maplibregl.Map({
                        container: 'map',
                        style: { // Basic style with OSM raster + our vector source
                            version: 8,
                            sources: {
                                osm: {
                                type: 'raster',
                                tiles: [
                                    'https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/tiles/{z}/{x}/{y}?access_token=' +mapboxAccessToken
                                ],
                                tileSize: 256,
                                attribution: '© Mapbox'
                            },
                                parishes: {
                                    type: 'vector',
                                    tiles: ['https://churches.onrender.com/tiles/{z}/{x}/{y}'],
                                    minzoom: metadata.minzoom || 0,
                                    maxzoom: metadata.maxzoom || 16, // Increased source maxzoom
                                    attribution: metadata.attribution || '',
                                    // Enable clustering
                                    cluster: true,
                                    clusterMaxZoom: 18, // Increased cluster break zoom
                                    clusterRadius: 100 // Radius of each cluster when clustering points (defaults to 50)
                                }
                            },
                            layers: [
                                { id: 'osm-tiles', type: 'raster', source: 'osm' }
                                // Church layers will be added in onMapLoad
                            ],
                            // Add glyphs URL for text rendering
                            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf"
                        },
                        center: [0, 0], // Default center
                        zoom: metadata.minzoom, // Default zoom
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

                    // --- Map Event Listeners ---
                    map.on('load', onMapLoad);
                    map.on('idle', onMapIdle); // Use idle to query features after map settles
                    // Click listener for unclustered points
                    map.on('click', churchLayerId, handleFeatureClick);
                    // Click listener for clusters
                    map.on('click', clusterLayerId, handleClusterClick);
                    // Hover effects
                    map.on('mouseenter', churchLayerId, () => map.getCanvas().style.cursor = 'pointer');
                    map.on('mouseleave', churchLayerId, () => map.getCanvas().style.cursor = '');
                    map.on('mouseenter', clusterLayerId, () => map.getCanvas().style.cursor = 'pointer');
                    map.on('mouseleave', clusterLayerId, () => map.getCanvas().style.cursor = '');

                    // Link "My Location" button to MapLibre control
                    document.getElementById('action-my-location').addEventListener('click', () => {
                        geolocateControl.trigger();
                        hideMobileMenu();
                    });

                })
                .catch(error => {
                    console.error('Error loading metadata:', error);
                    // updateLoadingStatus removed
                });
        }

        function onMapLoad() {
            // updateLoadingStatus removed
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

                    // updateLoadingStatus removed
                    addMapLayers();
                    // updateLoadingStatus removed
                    // Initial query moved to onMapIdle
                    // setTimeout(queryAndPopulateFeatures, 500); // Removed
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
                'source-layer': sourceLayerId, // Added missing source-layer
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
                    'circle-radius': [ // Reduced radii
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
                'source-layer': sourceLayerId, // Added missing source-layer
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    // Changed font to one available at the glyphs URL
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
                'source-layer': sourceLayerId, // Make sure this matches your MBTiles layer name
                filter: ['!', ['has', 'point_count']], // Filter out clusters
                layout: {
                    'icon-image': [
                    'case',
                    ['>=', ['index-of', 'basilica', ['downcase', ['get', 'Type']]], 0], 'cathedral-icon',
                    ['>=', ['index-of', 'cathedral', ['downcase', ['get', 'Type']]], 0], 'cathedral-icon',
                    ['>=', ['index-of', 'monument', ['downcase', ['get', 'Title']]], 0], 'monument-icon',
                    'church-icon' // default icon
                    ],

                                            // Simplified icon size - removed problematic 'includes' expression
                    'icon-size': 0.05,
                    'icon-allow-overlap': false, // Prevent overlap for individual icons
                    'icon-ignore-placement': false,
                    'icon-anchor': 'bottom'
                    // Add text label if desired
                    // 'text-field': ['get', 'Title'],
                    // 'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                    // 'text-size': 10,
                    // 'text-offset': [0, -1.5],
                    // 'text-anchor': 'top'
                },
                paint: {
                    // Add paint properties if needed (e.g., icon opacity)
                }
            });
        }

        function onMapIdle() {
            // This function is called when the map settles after movement or zooming.
            // No longer querying features for list here.
            //console.log("Map idle.");
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
                     city = addressParts[0].trim(); // Fallback if only one part
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

            // Highlight in list
            highlightChurchInList(feature.id); // Assuming features have a unique ID property
        }

        function handleClusterClick(e) {
             if (!e.features || !e.features.length) return;
             const features = map.queryRenderedFeatures(e.point, { layers: [clusterLayerId] });
             if (!features.length) return; // Exit if no cluster feature found

             // Zoom in on cluster click (removed getClusterExpansionZoom)
             map.easeTo({
                 center: features[0].geometry.coordinates,
                 zoom: map.getZoom() + 2 // Zoom in by 2 levels
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
                    // Scroll into view if needed
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
            document.getElementById('title-search').addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('city-search').addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('country-search').addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('jurisdiction-search').addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('type-search').addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('rite-search').addEventListener('input', debounce(applyFilters, 300));
            document.getElementById('reset-filters').addEventListener('click', resetFilters);
            //document.getElementById('zoom-to-filter').addEventListener('click', zoomToFiltered(churchdata.churches));
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
				title: document.getElementById('title-search').value.trim().toLowerCase(),
				country: document.getElementById('country-search').value.trim().toLowerCase(),
				type: document.getElementById('type-search').value.trim().toLowerCase(),
				address: document.getElementById('city-search').value.trim().toLowerCase(),
				rite: document.getElementById('rite-search').value.trim().toLowerCase(),
				jurisdiction: document.getElementById('jurisdiction-search').value.trim().toLowerCase()
			};

			updateMapFilter(filters);
		}
		
		async function updateMapFilter(filters) {
			const filterExpressions = ['all'];

			// Add a filter for each non-empty field
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

			// Apply the filter only to individual church features
			map.setFilter(churchLayerId, filterExpressions);
			map.setFilter(clusterCountLayerId, filterExpressions);
			map.setFilter(clusterLayerId, filterExpressions);

            const query = new URLSearchParams(filters);

            const response = await fetch(`https://churches.onrender.com/filter?${query.toString()}`);
            churchdata = await response.json();
            ChurchesManager.populateChurchList(churchdata.churches, churchdata.pagination);
            zoomToFiltered(churchdata.churches);

		}


        async function resetFilters() {
            console.log("Resetting filters");
            document.getElementById('title-search').value = '';
            document.getElementById('city-search').value = '';
            document.getElementById('country-search').value = '';
            document.getElementById('jurisdiction-search').value = '';
            document.getElementById('type-search').value = '';
            document.getElementById('rite-search').value = '';
            page = 1; // Reset page to 1
    
            const response = await fetch(`https://churches.onrender.com/churches?page=${page}&limit=500`);
            const data = await response.json();
            ChurchesManager.populateChurchList(data.churches, data.pagination);
            applyFilters(); // Re-apply to show all
        }

        function zoomToFiltered(features) {
            //console.log(features);
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
            // Mobile quick actions button
            const quickActionsBtn = document.getElementById('mobile-quick-actions');
            const menu = document.getElementById('mobile-actions-menu');
            if (quickActionsBtn && menu) {
                quickActionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (menu.classList.contains('visible')) {
                        hideMobileMenu();
                    } else {
                        menu.style.display = 'flex';
                        void menu.offsetWidth; // Trigger reflow
                        menu.classList.add('visible');
                        quickActionsBtn.textContent = '×';
                        updateMobileMenuIndicators();
                    }
                });
                // Hide menu if clicking outside
                document.addEventListener('click', (e) => {
                     if (!menu.contains(e.target) && e.target !== quickActionsBtn) {
                         hideMobileMenu();
                     }
                });
            }

            // Mobile action items
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
                    // "My Location" is handled directly in initMap

                    hideMobileMenu(); // Hide menu after action
                });
            });

             // Hide church list button (mobile only, though CSS might hide it)
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
                setTimeout(() => { menu.style.display = 'none'; }, 300); // Hide after transition
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
            // Check if the click originated from the close button
            if (event && event.target.classList.contains('close-button')) {
                return; // Do nothing if it's the close button
            }

            const content = document.getElementById(contentId);
            if (!content) return;
            const panel = content.closest('.panel');
            const toggleBtn = panel ? panel.querySelector('.toggle-btn') : null;

            if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                content.style.display = 'block'; // Or 'grid', 'flex', etc. depending on layout
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
                        filterPanel.style.display = 'none';

                        const legendPanel = document.getElementById("legend");
                        legendPanel.style.display = 'none';

                        panel.style.display = 'block';

                        // Ensure content is also visible if panel is shown
                        const content = document.getElementById(contentId);
                        if (content && content.classList.contains('collapsed')) {
                            togglePanel(contentId); // Expand content
                        }

                } if (panelId === "filter-panel") {
                        const listPanel = document.getElementById("church-list-panel");
                        listPanel.style.display = 'none';
                        const legendPanel = document.getElementById("legend");
                        legendPanel.style.display = 'none';

                        panel.style.display = 'block';

                        // Ensure content is also visible if panel is shown
                        const content = document.getElementById(contentId);
                        if (content && content.classList.contains('collapsed')) {
                            togglePanel(contentId); // Expand content
                        }
                } else {
                        const filterPanel = document.getElementById("filter-panel");
                        filterPanel.style.display = 'none';
                        const listPanel = document.getElementById("church-list-panel");
                        listPanel.style.display = 'none';

                        panel.style.display = 'block';

                        // Ensure content is also visible if panel is shown
                        const content = document.getElementById(contentId);
                        if (content && content.classList.contains('collapsed')) {
                            togglePanel(contentId); // Expand content
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
            // Show panels by default on desktop, hide on mobile (CSS handles initial state)
            // Ensure content is collapsed initially
            document.querySelectorAll('.panel-content').forEach(content => {
                 if (!content.classList.contains('collapsed')) {
                     content.classList.add('collapsed');
                     content.style.display = 'none';
                 }
                 const toggleBtn = content.previousElementSibling?.querySelector('.toggle-btn');
                 if (toggleBtn) toggleBtn.textContent = '+';
            });

             // Desktop specific overrides if needed (CSS handles most of this)
             if (window.innerWidth >= 768) {
                 // Example: Ensure filter panel content is visible on desktop load
                 // togglePanel('filter-content');
             }
        }

        // --- Searchable Dropdowns ---
        function setupSearchableDropdown(inputId, items) {
            const input = document.getElementById(inputId);
            const suggestionsContainerId = inputId + '-suggestions';
            let suggestionsContainer = document.getElementById(suggestionsContainerId);

            if (!input) return;

            // Create container if it doesn't exist
            if (!suggestionsContainer) {
                suggestionsContainer = document.createElement('div');
                suggestionsContainer.className = 'dropdown-list';
                suggestionsContainer.id = suggestionsContainerId;
                input.parentNode.appendChild(suggestionsContainer);

                // Add click handler for suggestions
                suggestionsContainer.addEventListener('click', (e) => {
                    if (e.target.classList.contains('dropdown-item')) {
                        input.value = e.target.textContent === 'All' ? '' : e.target.textContent;
                        hideSuggestions(inputId);
                        applyFilters(); // Apply filter after selection
                    }
                });
            }

            const displaySuggestions = () => {
                const query = input.value.toLowerCase();
                const matches = items.filter(item =>
                    item && item.toLowerCase().includes(query)
                ).slice(0, 10); // Limit suggestions

                suggestionsContainer.innerHTML = ''; // Clear previous

                // Add "All" option
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

            // Hide on blur or click outside
            input.addEventListener('blur', () => setTimeout(() => hideSuggestions(inputId), 150)); // Delay to allow click on suggestion
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
