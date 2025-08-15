/**
 * churches.js - Handles church list functionality with server-side pagination and search
 */

const ChurchesManager = (function() {
    // State
    let currentPage = 1;
    let currentSearch = '';
    let isLoading = false;

    /**
     * Loads churches from server with pagination and search
     * @param {number} page - Page number to load
     * @param {string} search - Search query
     * @private
     */
    async function loadChurches(page = 1, search = '') {
        if (isLoading) return;
        isLoading = true;

        const listElement = document.getElementById('church-list');
        if (listElement) {
            listElement.classList.add('loading');
        }

        try {
            const response = await fetch(`https://churches-in-the-world.onrender.com/churches?page=${page}&limit=500&search=${encodeURIComponent(search)}`);
            const data = await response.json();
            currentPage = data.pagination.currentPage;
            populateChurchList(data.churches, data.pagination);
        } catch (error) {
            console.error('Error loading churches:', error);
            if (listElement) {
                listElement.innerHTML = '<div class="error-message">Error loading churches. Please try again.</div>';
            }
        } finally {
            isLoading = false;
            if (listElement) {
                listElement.classList.remove('loading');
            }
        }
    }

    /**
     * Populates the church list with church items
     * @param {Array} churches - Array of church data
     * @param {Object} pagination - Pagination information
     * @private
     */
    function populateChurchList(churches, pagination) {
        const listElement = document.getElementById('church-list');
        if (!listElement) return;

        // Clear list if it's the first page
        if (pagination.currentPage === 1) {
            listElement.innerHTML = '';
        }

        // Check if we have churches
        if (!churches || churches.length === 0) {
            if (pagination.currentPage === 1) {
                listElement.innerHTML = '<div class="no-results">No churches found</div>';
            }
            return;
        }

        // Create church items
        churches.forEach((church, index) => {
            const item = document.createElement('div');
            item.className = 'church-item';
            item.id = `church-item-${(pagination.currentPage - 1) * pagination.limit + index}`;

            const title = document.createElement('div');
            title.className = 'church-title';
            //console.log('Church daat:', church);
            title.textContent = church.properties.Title || 'Unnamed Church';

            const details = document.createElement('div');
            details.className = 'church-details';

            // Extract city from address if not present
            let city = church.properties.City;
            if (!city && church.properties.Address) {
                const parts = church.properties.Address.split(',');
                city = parts.length > 1 ? parts[parts.length - 2].trim() : parts[0].trim();
            }
            //console.log('City:', city || 'N/A');

            let detailsText = '';
            if (church.properties.Rite) detailsText += church.properties.Rite;
            if (city) detailsText += (detailsText ? ' • ' : '') + city;
            if (church.properties.Country) detailsText += (detailsText ? ' • ' : '') + church.properties.Country;
            details.textContent = detailsText;
            
            item.appendChild(title);
            item.appendChild(details);
            
            // Add click handler to highlight on map
            item.addEventListener('click', () => {
                if (church.geometry && window.map) {
                    const lat = church.geometry.coordinates[1];
                    const lng = church.geometry.coordinates[0];
                    togglePanel("church-list-panel");
                    map.flyTo({ center: [lng, lat], zoom: 18 });
                }
            });

            listElement.appendChild(item);
        });

        updatePaginationControls(pagination);
    }

    /**
     * Updates pagination controls
     * @param {Object} pagination - Pagination information
     * @private
     */
function updatePaginationControls(pagination) {
    let paginationElement = document.getElementById('church-list-pagination');

    // Create container if it doesn't exist
    if (!paginationElement) {
        paginationElement = document.createElement('div');
        paginationElement.id = 'church-list-pagination';
        paginationElement.className = 'pagination-controls';
        const churchList = document.getElementById('church-list');
        if (churchList && churchList.parentNode) {
            churchList.parentNode.appendChild(paginationElement);
        }
    }

    // Clear previous content
    paginationElement.innerHTML = '';

    // Create left, center, right containers
    const prevContainer = document.createElement('div');
    prevContainer.className = 'pagination-left';

    const infoContainer = document.createElement('div');
    infoContainer.className = 'pagination-center';

    const nextContainer = document.createElement('div');
    nextContainer.className = 'pagination-right';

    // Page info text
    const start = (pagination.currentPage - 1) * pagination.limit + 1;
    const end = Math.min(pagination.currentPage * pagination.limit, pagination.total);
    const info = document.createElement('span');
    info.id = 'pageInfo';
    info.textContent = `${start} - ${end} of ${pagination.total}`;
    infoContainer.appendChild(info);

    // Previous button
    if (pagination.currentPage > 1) {
        const prevButton = document.createElement('button');
        prevButton.textContent = 'Previous';
        prevButton.onclick = () => loadChurches(pagination.currentPage - 1, currentSearch);
        prevContainer.appendChild(prevButton);
    }

    // Next button
    if (pagination.currentPage < pagination.totalPages) {
        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next';
        nextButton.onclick = () => loadChurches(pagination.currentPage + 1, currentSearch);
        nextContainer.appendChild(nextButton);
    }

    // Append containers to main pagination element
    paginationElement.appendChild(prevContainer);
    paginationElement.appendChild(infoContainer);
    paginationElement.appendChild(nextContainer);
}


    /**
     * Sets up church list search functionality
     * @private
     */
    function setupListSearch() {
        const searchInput = document.getElementById('list-search');
        if (!searchInput) return;

        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentSearch = e.target.value;
                currentPage = 1;
                loadChurches(1, currentSearch);
            }, 300);
    });
}

function togglePanelVisibility(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
        panel.classList.toggle('collapsed');
    }
}

    /**
     * Initializes church list functionality
     * @public
     */
    function init() {
        setupListSearch();
        loadChurches(1);

        // Show church list panel on desktop
        if (window.innerWidth >= 768) {
            const panel = document.getElementById('church-list-panel');
            if (panel) panel.style.display = 'block';
        }
    }

    // Public API
    return {
        init,
        loadChurches,
        populateChurchList 
    };
})();

// Initialize churches manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    ChurchesManager.init();
});

// Make it globally accessible
window.ChurchesManager = ChurchesManager;

// Filter Panel Code
function initializeFilterDropdowns(features) {
    const uniqueValues = {
        Title: new Set(),
        City: new Set(),
        Country: new Set(),
        Jurisdiction: new Set(),
        Type: new Set(),
        Rite: new Set()
    };

    features.forEach(f => {
        const props = f.properties;
        // Extract city if needed
        let city = props.City || null;
        if (!city && props.Address) {
            const addressParts = props.Address.split(',');
            if (addressParts.length >= 2) city = addressParts[addressParts.length - 2].trim();
            else if (addressParts.length === 1) city = addressParts[0].trim();
        }

        if (props.Title) uniqueValues.Title.add(props.Title);
        if (city) uniqueValues.City.add(city);
        if (props.Country) uniqueValues.Country.add(props.Country);
        if (props.Jurisdiction) uniqueValues.Jurisdiction.add(props.Jurisdiction);
        if (props.Type) uniqueValues.Type.add(props.Type);
        if (props.Rite) uniqueValues.Rite.add(props.Rite);
    });

    // These functions must be available in the global scope or imported here
    setupSearchableDropdown('title-search', Array.from(uniqueValues.Title).sort());
    setupSearchableDropdown('city-search', Array.from(uniqueValues.City).sort());
    setupSearchableDropdown('country-search', Array.from(uniqueValues.Country).sort());
    setupSearchableDropdown('jurisdiction-search', Array.from(uniqueValues.Jurisdiction).sort());
    setupSearchableDropdown('type-search', Array.from(uniqueValues.Type).sort());
    setupSearchableDropdown('rite-search', Array.from(uniqueValues.Rite).sort());
}

// Expose globally if not using modules
window.initializeFilterDropdowns = initializeFilterDropdowns;
