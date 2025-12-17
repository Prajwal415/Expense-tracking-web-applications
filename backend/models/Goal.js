const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    id: {
      type: String,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    targetAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    savedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    period: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'paused', 'cancelled'],
      default: 'active',
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
goalSchema.index({ userId: 1, status: 1 });
goalSchema.index({ userId: 1, createdAt: -1 });

// Pre-save hook to update the updatedAt field
goalSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Goal = mongoose.model('Goal', goalSchema);

module.exports = Goal;
