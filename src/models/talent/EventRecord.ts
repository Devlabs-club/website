import mongoose from 'mongoose';
import {
  EVENT_TYPES,
  FORM_FIELD_TYPES,
  REGISTRATION_STATUSES,
} from '../../lib/talent/eventTypes';

const EventFormFieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: FORM_FIELD_TYPES, required: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: null },
    helpText: { type: String, default: null },
    options: { type: [String], default: [] },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const EventRecordSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    slug: { type: String, index: true, unique: true, sparse: true },
    date: { type: Date, required: true, index: true },
    endDate: { type: Date, default: null },
    type: {
      type: String,
      enum: EVENT_TYPES,
      required: true,
    },
    location: { type: String, default: null },
    description: { type: String, default: null },
    source: { type: String, default: 'manual' },
    verificationStatus: {
      type: String,
      enum: ['imported_unverified', 'admin_verified', 'rejected'],
      default: 'imported_unverified',
    },
    headerImageUrl: { type: String, default: null },
    websiteUrl: { type: String, default: null },
    registrationStatus: {
      type: String,
      enum: REGISTRATION_STATUSES,
      default: 'draft',
      index: true,
    },
    registrationOpensAt: { type: Date, default: null },
    registrationClosesAt: { type: Date, default: null },
    formSchema: {
      fields: { type: [EventFormFieldSchema], default: [] },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

EventRecordSchema.index({ name: 1, date: 1 }, { unique: true });

export default (mongoose.models.EventRecord as mongoose.Model<any>) ||
  mongoose.model('EventRecord', EventRecordSchema);
