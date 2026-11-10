const { randomToken } = require('../../utils/tokens');

const TINY_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEA8QEA8PDxAPDw8PDw8PDw8PFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAgACAMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAADAAIEBQYBB//EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Anf/Z';

class MockProvider {
  constructor() {
    this.name = 'mock';
    this.runCalls = 0;
    this.jobs = new Map();
  }

  async run() {
    this.runCalls += 1;
    const id = `mock-${randomToken(8)}`;
    this.jobs.set(id, { steps: ['starting', 'in_queue', 'processing', 'completed'] });
    return { id };
  }

  async status(id) {
    const job = this.jobs.get(id) || { steps: ['completed'] };
    const next = job.steps.shift() || 'completed';
    if (next !== 'completed') return { status: next, output: null, error: null };
    return {
      status: 'completed',
      output: [`data:image/jpeg;base64,${TINY_JPEG}`],
      error: null,
      creditsUsed: 0,
    };
  }

  async credits() {
    return { credits: 100, unavailable: false };
  }
}

module.exports = { MockProvider, TINY_JPEG };
