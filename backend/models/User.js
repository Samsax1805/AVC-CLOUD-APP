const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: function() {
            return this.provider === "local";
        },
        unique: true
    },
    phone: {
        type: String,
        required: function() {
            return this.provider === "local";
        }
    },
    password: {
        type: String,
        required: function() {
            return this.provider === "local";
        }
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    avatar: String,
    roles: {
        type: [String],
        default: ['member']
    },
    section: {
        type: String,
        default: null
    },
    dob: String,
    country: String,
    status: {
        type: String,
        enum: ['active', 'pending', 'deactivated'],
        default: 'active'
    },
    provider: {
        type: String,
        enum:["local","google"],
        default:"local"
    }
},{timestamps:true});

userSchema.pre('save', async function() {
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);