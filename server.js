const express = require('express');
const MBTiles = require('@mapbox/mbtiles');
const path = require('path');
const fs = require('fs');


const app = express();


// Paths
const outputMBTilesPath = path.join(__dirname,'/data/tiles/', 'parishes.mbtiles');

// MBTiles part files (make sure these exist in the same folder)
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

// Reassemble parts
async function reassembleParts() {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(outputMBTilesPath);
    function pipeNext(index) {
      if (index >= parts.length) {
        writeStream.end(() => {
          console.log('✅ MBTiles file reassembled.');
          resolve();
        });
        return;
      }

      const partPath = path.join(__dirname, parts[index]);
      const readStream = fs.createReadStream(partPath);

      readStream.pipe(writeStream, { end: false });
      readStream.on('end', () => pipeNext(index + 1));
      readStream.on('error', reject);
    }

    pipeNext(0);
  });
}

// Load JSON data
function loadChurchData() {
  const churchFiles = ['data/a.json', 'data/b.json', 'data/c.json', 'data/d.json', 'data/e.json'];
  let allData = [];
  churchFiles.forEach(file => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    if (Array.isArray(data.features)) {
      allData = allData.concat(data.features);
    }
  });
  console.log('✅ Total churches loaded:', allData.length);
  return allData;
}

// Start server
(async () => {
  await reassembleParts();

  const churchData = loadChurchData();
  let tileInfo = null;

  // Enable CORS
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });

  app.use(express.static(__dirname));

  new MBTiles(outputMBTilesPath, (err, mbtiles) => {
    if (err) {
      console.error('❌ Failed to load MBTiles:', err);
      process.exit(1);
    }

    mbtiles.getInfo((err, info) => {
      if (err) {
        console.error('❌ Failed to load tile metadata:', err);
        process.exit(1);
      }
      tileInfo = info;
    });

    // Serve tiles
    app.get('/tiles/:z/:x/:y', (req, res) => {
      const { z, x, y } = req.params;
      mbtiles.getTile(z, x, y, (err, tile, headers) => {
        if (err) {
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

      const limit = 1000; // Set a limit for the number of results per page
      const startIndex = (1 - 1) * limit;
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

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  });
})();
