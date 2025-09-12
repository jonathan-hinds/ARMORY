class Adventure {
  constructor() {
    this.time = 0;
    this.events = [];
  }

  schedule(delay, fn) {
    this.events.push({ time: this.time + delay, fn });
  }

  run(limit = 60) {
    this.events.sort((a,b) => a.time - b.time);
    while (this.events.length && this.time < limit) {
      const next = this.events.shift();
      this.time = next.time;
      next.fn(this.time);
      this.events.sort((a,b) => a.time - b.time);
    }
  }
}

module.exports = Adventure;
