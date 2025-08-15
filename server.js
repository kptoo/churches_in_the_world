const express = require('express');
const MBTiles = require('@mapbox/mbtiles');
const path = require('path');
const fs = require('fs');

const app = express();

// Get port from environment variable (Render provides this)
const PORT = process.env.PORT || 3000;

// Paths - FIXED: Point to correct directories
const outputMBTilesPath = path.join(__dirname, 'data/tiles', 'parishes.mbtiles');

// MBTiles part files (these are in data/tiles/ directory)
const parts = [
  'parishes.mbtiles.part.aa',
  'parishes.mbtiles.part.ab',
  'parishes.mbtiles.part.ac',
  'parishes.mbtiles.part.ad',
  'parishes.mbtiles.part.ae',
  'parishes.mbtiles.part.af',
  'parishes.mbtiles.part.ag',
  'parishes.mbtiles.part.ah',
  'parishes.mbtiles.part.ai',
  'parishes.mbtiles.part.aj',
  'parishes.mbtiles.part.ak',
  'parishes.mbtiles.part.al',
  'parishes.mbtiles.part.am',
  'parishes.mbtiles.part.an',
  'parishes.mbtiles.part.ao',
  'parishes.mbtiles.part.ap',
  'parishes.mbtiles.part.aq',
  'parishes.mbtiles.part.ar',
  'parishes.mbtiles.part.as',
  'parishes.mbtiles.part.at',
  'parishes.mbtiles.part.au',
  'parishes.mbtiles.part.av',
  'parishes.mbtiles.part.aw',
  'parishes.mbtiles.part.ax',
  'parishes.mbtiles.part.ay',
  'parishes.mbtiles.part.az',
  'parishes.mbtiles.part.ba',
  'parishes.mbtiles.part.bb',
  'parishes.mbtiles.part.bc',
  'parishes.mbtiles.part.bd',
  'parishes.mbtiles.part.be',
  'parishes.mbtiles.part.bf',
  'parishes.mbtiles.part.bg',
  'parishes.mbtiles.part.bh',
  'parishes.mbtiles.part.bi',
  'parishes.mbtiles.part.bj',
  'parishes.mbtiles.part.bk',
  'parishes.mbtiles.part.bl',
  'parishes.mbtiles.part.bm'
];

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Reassemble parts - FIXED: Look in correct directory
async function reassembleParts() {
  // Check if MBTiles file already exists
  if (fs.existsSync(outputMBTilesPath)) {
    console.log('✅ MBTiles file already exists, skipping reassembly');
    return;
  }

  return new Promise((resolve, reject) => {
    console.log('🔄 Reassembling MBTiles parts...');
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputMBTilesPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(outputMBTilesPath);
    
    function pipeNext(index) {
      if (index >= parts.length) {
        writeStream.end(() => {
          console.log('✅ MBTiles file reassembled successfully');
          resolve();
        });
        return;
      }

      // FIXED: Look in the data/tiles/ directory
      const partPath = path.join(__dirname, 'data/tiles', parts[index]);
      
      // Check if part file exists
      if (!fs.existsSync(partPath)) {
        console.warn(`⚠️  Part file not found: ${partPath}`);
        pipeNext(index + 1);
        return;
      }

      console.log(`📂 Processing: ${partPath}`);
      const readStream = fs.createReadStream(partPath);
      readStream.pipe(writeStream, { end: false });
      readStream.on('end', () => {
        console.log(`✅ Processed part ${index + 1}/${parts.length}`);
        pipeNext(index + 1);
      });
      readStream.on('error', (error) => {
        console.error(`❌ Error reading part ${partPath}:`, error);
        reject(error);
      });
    }

    writeStream.on('error', reject);
    pipeNext(0);
  });
}

// Load JSON data
function loadChurchData() {
  const churchFiles = ['data/a.json', 'data/b.json', 'data/c.json', 'data/d.json', 'data/e.json'];
  let allData = [];
  
  churchFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(data.features)) {
          allData = allData.concat(data.features);
        }
      } catch (error) {
        console.warn(`⚠️  Could not load ${file}:`, error.message);
      }
    } else {
      console.warn(`⚠️  File not found: ${file}`);
    }
  });
  
  console.log(`✅ Total churches loaded: ${allData.length}`);
  return allData;
}

// Start server
(async () => {
  try {
    // Reassemble MBTiles if needed
    await reassembleParts();

    // Load church data
    const churchData = loadChurchData();
    let tileInfo = null;

    // Enable CORS for all origins (adjust for production)
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      next();
    });

    // Serve static files (for your frontend if needed)
    app.use(express.static(__dirname));

    // Check if MBTiles file exists before proceeding
    if (!fs.existsSync(outputMBTilesPath)) {
      console.error('❌ MBTiles file not found after reassembly');
      process.exit(1);
    }

    new MBTiles(outputMBTilesPath, (err, mbtiles) => {
      if (err) {
        console.error('❌ Failed to load MBTiles:', err);
        process.exit(1);
      }

      console.log('✅ MBTiles loaded successfully');

      mbtiles.getInfo((err, info) => {
        if (err) {
          console.error('❌ Failed to load tile metadata:', err);
          process.exit(1);
        }
        tileInfo = info;
        console.log('✅ Tile metadata loaded');
      });

      // Serve tiles
      app.get('/tiles/:z/:x/:y', (req, res) => {
        const { z, x, y } = req.params;
        mbtiles.getTile(z, x, y, (err, tile, headers) => {
          if (err) {
            console.log(`Tile not found: ${z}/${x}/${y}`);
            res.status(404).send('Tile not found');
          } else {
            res.set(headers);
            res.send(tile);
          }
        });
      });

      // Serve metadata
      app.get('/metadata', (req, res) => {
        if (!tileInfo) {
          return res.status(500).json({ error: 'Metadata not loaded' });
        }

        res.json({
          ...tileInfo,
          sourceLayerId: tileInfo.vector_layers ? tileInfo.vector_layers[0].id : 'parishes',
          churchData: {
            bounds: tileInfo.bounds || [-180, -85.0511, 180, 85.0511],
            center: tileInfo.center,
            minzoom: tileInfo.minzoom,
            maxzoom: tileInfo.maxzoom,
            attribution: tileInfo.attribution
          }
        });
      });

      // Paginated / searchable churches API
      app.get('/churches', (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const search = (req.query.search || '').toLowerCase();

        let filtered = churchData;

        if (search) {
          filtered = filtered.filter(church => {
            const p = church.properties || {};
            return ['Title', 'Address', 'Country', 'Jurisdiction', 'Type', 'Rite']
              .some(key => (p[key] || '').toLowerCase().includes(search));
          });
        }

        const startIndex = (page - 1) * limit;
        const paginatedData = filtered.slice(startIndex, startIndex + limit);

        res.json({
          churches: paginatedData,
          pagination: {
            total: filtered.length,
            totalPages: Math.ceil(filtered.length / limit),
            currentPage: page,
            limit
          }
        });
      });

      // Filter endpoint
      app.get('/filter', (req, res) => {
        const title = (req.query.title || '').toLowerCase();
        const jurisdiction = (req.query.jurisdiction || '').toLowerCase();
        const rite = (req.query.rite || '').toLowerCase();
        const type = (req.query.type || '').toLowerCase();
        const country = (req.query.country || '').toLowerCase();
        const address = (req.query.address || '').toLowerCase();
      
        let filtered = churchData;
      
        filtered = filtered.filter(church => {
          const p = church.properties || {};
          return (!title || (p.Title || '').toLowerCase().includes(title)) &&
                 (!jurisdiction || (p.Jurisdiction || '').toLowerCase().includes(jurisdiction)) &&
                 (!rite || (p.Rite || '').toLowerCase().includes(rite)) &&
                 (!type || (p.Type || '').toLowerCase().includes(type)) &&
                 (!country || (p.Country || '').toLowerCase().includes(country)) &&
                 (!address || (p.Address || '').toLowerCase().includes(address));
        });

        const limit = 1000;
        const startIndex = 0;
        const paginatedData = filtered.slice(startIndex, startIndex + limit);

        res.json({
          churches: paginatedData,
          pagination: {
            total: filtered.length,
            totalPages: Math.ceil(filtered.length / limit),
            currentPage: 1,
            limit
          }
        });
      });

      // Start the server
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📍 Health check: http://localhost:${PORT}/health`);
        console.log(`🗺️  Metadata: http://localhost:${PORT}/metadata`);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();
