const mongoose = require('mongoose');

const PaletteTileSchema = new mongoose.Schema(
  {
    tileId: { type: String, required: true },
    sprite: { type: String, required: true },
    fill: { type: String, default: '#ffffff' },
    walkable: { type: Boolean, default: true },
  },
  { _id: false }
);

const SpritePaletteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    tiles: {
      type: [PaletteTileSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

SpritePaletteSchema.index({ name: 1 }, { unique: true });
SpritePaletteSchema.index({ 'tiles.tileId': 1, name: 1 });

module.exports = mongoose.model('SpritePalette', SpritePaletteSchema);
