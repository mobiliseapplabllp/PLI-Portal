const mongoose = require('mongoose');
const { KPI_CATEGORIES, KPI_UNITS } = require('../config/constants');

const kpiTemplateSchema = new mongoose.Schema(
  {
    name: {
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
    defaultWeightage: {
      type: Number,
    },
    defaultTargetValue: {
      type: Number,
    },
    defaultThresholdValue: {
      type: Number,
    },
    defaultStretchTarget: {
      type: Number,
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

kpiTemplateSchema.index({ isActive: 1, category: 1 });
kpiTemplateSchema.index({ name: 'text' });

module.exports = mongoose.model('KpiTemplate', kpiTemplateSchema);
