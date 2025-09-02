require('dotenv').config(); // Make sure this is at the very top

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
// existing imports


const mongoose = require('mongoose');
require('dotenv').config();  

mongoose.connect(process.env.MONGODB_URI, {
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => console.error('❌ MongoDB connection error:', err)); 

// Ad schema and model
const adSchema = new mongoose.Schema({
   phone: String,
  city: String,
  address: String,
  category: String, // ← we use this instead of group
  imageUrl: String, // ← this is what we save from Cloudinary
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Ad = mongoose.model('Ad', adSchema);



const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator'); // ← Add here
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return escapeMap[char];
  });
}


const app = express();
const port = 3000;
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// middleware and static folder setup
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// multer setup
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'free-ad-site-uploads', // you can customize this folder name
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [{ width: 1000, crop: 'limit' }], // Optional
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 🔒 2 MB file size limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedTypes.test(file.mimetype);

    if (extName && mimeType) {
      cb(null, true); // ✅ Accept file
    } else {
      cb(new Error('Only image files (jpeg, jpg, png, gif) are allowed!'));
    }
  }
});


// ✅ Add this NEW ROUTE for /ads here:
app.get('/ads', async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: 1 });

    let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');

    const groupedAds = {
      clothing: [],
      sports: [],
      cosmetics: [],
      jewelry: [],
      food: [],
      electronics: [],
      medical: [],
      automobile: [],
      education: []
    };

    ads.forEach(ad => {
      const category = ad.category.toLowerCase();
      if (groupedAds[category]) {
        groupedAds[category].push(ad);
      }
    });

    Object.keys(groupedAds).forEach(category => {
      let adsHtml = '<div style="width: 100%;">';

      groupedAds[category].forEach(ad => {
        adsHtml += `
          <div class="ad">
            <img src="${ad.imageUrl}" />
            <p><strong>Phone:</strong> ${escapeHtml(ad.phone)}</p>
            <p><strong>City:</strong> ${escapeHtml(ad.city)}</p>
            <p><strong>Address:</strong> ${escapeHtml(ad.address || '')}</p>
            <p><strong>Group:</strong> ${escapeHtml(ad.category)}</p>
          </div>
        `;
      });

      adsHtml += '</div>';
      html = html.replace(`<!--ADS_${category.toUpperCase()}-->`, adsHtml);
    });

    res.send(html);
  } catch (err) {
    console.error('❌ Error loading ads from MongoDB:', err);
    res.status(500).send('<h2>Failed to load ads</h2>');
  }
});

  



// existing POST /submit route
app.post(
  '/submit',
  (req, res, next) => {
    upload.single('image')(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return res.send(`<h2>Upload Error: ${err.message}</h2><a href="/">Go back</a>`);
      } else if (err) {
        return res.send(`<h2>Upload Error: ${err.message}</h2><a href="/">Go back</a>`);
      }
      next();
    });
  },
  [
    body('phone').trim().isMobilePhone().withMessage('Invalid phone number'),
    body('city').trim().escape(),
    body('address').optional().trim().escape(),
    body('group').trim().escape()
  ],
    (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).send('Invalid input: ' + JSON.stringify(errors.array()));
    }

    const { phone, city, address, group } = req.body;
    const imagePath = req.file ? req.file.path : '';
  


// Count ads by phone number
Ad.countDocuments({ phone })
  .then(count => {
    if (count >= 2) {
      return res.send(`<h2>Limit reached: Only 2 ads allowed per phone number.</h2><a href="/">Go back</a>`);
    }

    const newAd = new Ad({
      phone,
      city,
      address,
      category: group, // group is the form field name
      imageUrl: imagePath
    });

    return newAd.save()
      .then(() => {
        res.send(`<h2>Ad submitted successfully!</h2><a href="/">Go back</a>`);
      });
  })
  .catch(err => {
    console.error('❌ Error checking ad count or saving ad:', err);
    res.status(500).send(`<h2>Internal error</h2><a href="/">Go back</a>`);
  });
  }
);


app.get('/', async (req, res) => {
  try {
    const template = fs.readFileSync('template.html', 'utf8');
    const ads = await Ad.find().sort({ createdAt: -1 });

    const grouped = {
      clothing: [],
      cosmetics: [],
      sports: [],
      jewelry: [],
      food: [],
      electronics: [],
      medical: [],
      automobile: [],
      education: []
    };

    ads.forEach(ad => {
      const html = `
        <div class="ad">
          <img src="${ad.imageUrl}" />
          <p><strong>Phone:</strong> ${escapeHtml(ad.phone)}</p>
          <p><strong>City:</strong> ${escapeHtml(ad.city)}</p>
          <p><strong>Address:</strong> ${escapeHtml(ad.address || '')}</p>
        </div>
      `;
      const category = ad.category.toLowerCase();
      if (grouped[category]) {
        grouped[category].push(html);
      }
    });

    let finalHtml = template;

    Object.keys(grouped).forEach(category => {
      finalHtml = finalHtml.replace(`<!--ADS_${category.toUpperCase()}-->`, grouped[category].join('\n'));
    });

    res.send(finalHtml);
  } catch (err) {
    console.error('❌ Failed to load homepage ads from MongoDB:', err);
    res.status(500).send('<h2>Failed to load homepage</h2>');
  }
});


// homepage route
app.get('/search', async (req, res) => {
  const searchedCity = req.query.city.toLowerCase();

  try {
    const ads = await Ad.find({ city: new RegExp(`^${searchedCity}$`, 'i') });

    let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');

    let resultHtml = `<h2>Results for "${escapeHtml(searchedCity)}"</h2>`;
    if (ads.length > 0) {
      ads.forEach(ad => {
        resultHtml += `
          <div class="ad">
            <img src="${ad.imageUrl}" />
            <p><strong>Phone:</strong> ${escapeHtml(ad.phone)}</p>
            <p><strong>City:</strong> ${escapeHtml(ad.city)}</p>
            <p><strong>Address:</strong> ${escapeHtml(ad.address || '')}</p>
            <p><strong>Group:</strong> ${escapeHtml(ad.category)}</p>
          </div>
        `;
      });
    } else {
      resultHtml += `<p>Sorry, there are no ads from this city.</p>`;
    }

    html = html.replace('<!--ADS_CITY_SEARCH-->', resultHtml);
    res.send(html);
  } catch (err) {
    console.error('❌ Failed to search ads from MongoDB:', err);
    res.status(500).send('<h2>Search failed</h2>');
  }
});


// start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
