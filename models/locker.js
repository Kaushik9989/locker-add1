const mongoose = require('mongoose');

const CompartmentSchema = new mongoose.Schema({
  compartmentId: String,
  isLocked: { type: Boolean, default: true },
  isBooked: { type: Boolean, default: false },
  size: {
    type: String,
    enum: ['small', 'medium', 'large'], // ✅ Restricts to valid sizes
    default: "medium" // ✅ Optional: make it required
  },
  bookingInfo: {
    userId: { type: String, default: null },
    bookingTime: { type: Date, default: null },
    otp: { type: String, default: null },
    recieverName :  { type: String, default: null },
    recieverPhone : {type: String, default: null}
  },
    utility: {
    type: String,
    enum: ['standard', 'cooler', 'freezer', 'temperature-controlled', 'electronics-safe'],
    default: 'standard'
  },
  courierInfo: {
    courierId: mongoose.Schema.Types.ObjectId,
    deliveryTime: Date
  },
  qrCode: { type: String, default: null }
});

const LockerSchema = new mongoose.Schema({
  lockerId: { type: String, required: true, unique: true },
  location_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DropLocation' },
  location: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String }
  },
  compartments: [CompartmentSchema]
});

module.exports = mongoose.model('Locker', LockerSchema);
