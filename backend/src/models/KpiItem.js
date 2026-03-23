const mongoose = require('mongoose');
const { KPI_CATEGORIES, KPI_UNITS } = require('../config/constants');

const kpiItemSchema = new mongoose.Schema(
  {
    kpiAssignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KpiAssignment',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: KPI_CATEGORIES,
      default: 'Other',
    },
    unit: {
      type: String,
      enum: KPI_UNITS,
      default: 'Number',
    },
    weightage: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    targetValue: {
      type: Number,
      required: true,
    },
    thresholdValue: {
      type: Number,
    },
    stretchTarget: {
      type: Number,
    },
    remarks: {
      type: String,
      trim: true,
    },

    // Employee layer
    employeeValue: { type: Number, default: null },
    employeeComment: { type: String, trim: true },
    employeeAttachment: { type: String }, // file path
    employeeSubmittedAt: { type: Date },

    // Manager layer
    managerValue: { type: Number, default: null },
    managerScore: { type: Number, min: 0, max: 100, default: null },
    managerComment: { type: String, trim: true },
    managerReviewedAt: { type: Date },

    // Final reviewer layer
    finalValue: { type: Number, default: null },
    finalScore: { type: Number, min: 0, max: 100, default: null },
    finalComment: { type: String, trim: true },
    finalReviewedAt: { type: Date },

    itemStatus: {
      type: String,
      default: 'draft',
    },
  },
  {
    timestamps: true,
  }
);

kpiItemSchema.index({ kpiAssignment: 1 });

module.exports = mongoose.model('KpiItem', kpiItemSchema);
