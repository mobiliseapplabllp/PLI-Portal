const mongoose = require('mongoose');

const slabSchema = new mongoose.Schema(
  {
    minScore: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    payoutPercentage: { type: Number, required: true },
    label: { type: String, trim: true },
  },
  { _id: false }
);

const pliRuleSchema = new mongoose.Schema(
  {
    financialYear: {
      type: String,
      required: true,
    },
    quarter: {
      type: String,
      required: true,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
    },
    slabs: {
      type: [slabSchema],
      required: true,
      validate: {
        validator: function (slabs) {
          return slabs.length > 0;
        },
        message: 'At least one slab is required',
      },
    },
    remarks: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

pliRuleSchema.index({ financialYear: 1, quarter: 1 }, { unique: true });

module.exports = mongoose.model('PliRule', pliRuleSchema);
