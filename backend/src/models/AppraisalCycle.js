const mongoose = require('mongoose');
const { CYCLE_STATUS } = require('../config/constants');

const appraisalCycleSchema = new mongoose.Schema(
  {
    financialYear: {
      type: String,
      required: true,
      trim: true, // e.g., "2025-26"
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    quarter: {
      type: String,
      required: true,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
    },
    employeeSubmissionDeadline: {
      type: Date,
    },
    managerReviewDeadline: {
      type: Date,
    },
    finalReviewDeadline: {
      type: Date,
    },
    status: {
      type: String,
      enum: Object.values(CYCLE_STATUS),
      default: CYCLE_STATUS.DRAFT,
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

// One cycle per FY + month
appraisalCycleSchema.index({ financialYear: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('AppraisalCycle', appraisalCycleSchema);
