const express = require('express');
const app  = express();
const morgan = require('morgan');
const bodyParser = require('body-parser');

app.use(morgan('dev'));
app.use(bodyParser.urlencoded({limit: '100mb',extended: true}));
app.use(bodyParser.json({limit: '100mb'}));


const uploadRoutes = require('./api/routes/uploads');
app.use('/api', uploadRoutes);

app.use((req,res,next) => {
    const error  = new Error('Verify the END-POINT or the request Method (POST)');
    error.status=418;
    next(error);
});


app.use((error,req,res,next) => {
    res.status(error.status || 500);
    res.json({
        error: {
            message:error.message
        }
    });
});

module.exports = app ;