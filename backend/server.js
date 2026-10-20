const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const dotenv = require('dotenv');
dotenv.config();
require('./config/passport');
const User = require('./models/User');

const userAuthRoutes = require('./routes/userAuthRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Routes
app.use('/api/auth', userAuthRoutes);

// Connect to MongoDB
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI).then(() => {
            console.log('Connected to MongoDB');

            // Start the server
            const PORT = process.env.PORT || 5000;
            app.listen(PORT, () => {
                console.log(`Server is running on port ${PORT}`);
            });
        });

        try {
            await User.collection.dropIndex('googleId_1');
        } catch (error) {
            if (error.codeName !== 'IndexNotFound') {
                throw error;
            }
        }
        await User.collection.createIndex(
            { googleId: 1 },
            { unique: true, sparse: true, name: 'googleId_1' }
        );
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    }
}

startServer();