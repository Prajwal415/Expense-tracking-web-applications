const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true,
  },
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false,
  },
  profilePic: {
    type: String,
    default: null,
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK'],
  },
  theme: {
    type: String,
    default: 'light',
    enum: ['light', 'dark'],
  },
  salary: {
    type: Number,
    default: 0,
    min: 0,
  },
  categories: {
    type: [String],
    default: ['Food', 'Rent', 'Travel', 'Vehicle loan', 'Home loan', 'Education', 'Entertainment', 'Shopping', 'Utilities', 'Other'],
  },
  planData: {
    investPercent: { type: Number, default: 30 },
    savePercent: { type: Number, default: 20 },
    essentialPercent: { type: Number, default: 50 },
    investAmount: { type: Number, default: 0 },
    saveAmount: { type: Number, default: 0 },
    essentialAmount: { type: Number, default: 0 },
    appliedAt: { type: Date, default: null },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Update the updatedAt field on every save
userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Match password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
