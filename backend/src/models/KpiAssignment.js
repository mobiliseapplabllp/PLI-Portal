const mongoose = require('mongoose');
const { KPI_STATUS } = require('../config/constants');

const kpiAssignmentSchema = new mongoose.Schema(
  {
    financialYear: {
      type: String,
      required: true,
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
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: Object.values(KPI_STATUS),
      default: KPI_STATUS.DRAFT,
    },
    totalWeightage: {
      type: Number,
      default: 0,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockedAt: Date,
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    employeeSubmittedAt: Date,
    managerReviewedAt: Date,
    finalReviewedAt: Date,
    monthlyWeightedScore: {
      type: Number,
      default: null, // calculated after final review
    },
  },
  {
    timestamps: true,
  }
);

// One assignment per employee per FY + month
kpiAssignmentSchema.index({ employee: 1, financialYear: 1, month: 1 }, { unique: true });
kpiAssignmentSchema.index({ manager: 1, financialYear: 1, month: 1 });
kpiAssignmentSchema.index({ status: 1 });
kpiAssignmentSchema.index({ financialYear: 1, quarter: 1 });

module.exports = mongoose.model('KpiAssignment', kpiAssignmentSchema);
