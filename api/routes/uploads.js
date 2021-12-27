const express = require('express');
const router = express.Router();
const multer  = require('multer');
const destination = multer({ dest: './api/resources/uploads/' });
// const multer=require('multer');
//const destination=multer({storage: multer.memoryStorage()});
const uploadController = require('../controllers/uploadController');


router.post('/upload',destination.single('file'),uploadController.upload);

module.exports = router;