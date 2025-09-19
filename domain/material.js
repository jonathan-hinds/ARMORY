class Material {
  constructor({ id, name, rarity, cost = 0, description = '', kind = 'material', slot = 'material' }) {
    this.id = id;
    this.name = name;
    this.rarity = rarity || 'Common';
    this.cost = typeof cost === 'number' ? cost : 0;
    this.description = description || '';
    this.kind = kind || 'material';
    this.slot = slot || 'material';
    this.category = 'Material';
  }
}

module.exports = Material;
