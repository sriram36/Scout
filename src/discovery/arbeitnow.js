const axios = require('axios');

async function fetchArbeitnow(keywords = ['engineer', 'developer']) {
  try {
    const res = await axios.get('https://www.arbeitnow.com/api/job-board-api', { timeout: 10000 });
    
    if (!res.data || !res.data.data) return [];

    return res.data.data
      .filter(job => job.remote === true) // Strict remote-only
      .filter(job => {
        const title = (job.title || '').toLowerCase();
        return keywords.some(kw => title.includes(kw));
      })
      .map(job => ({
        title: job.title,
        company: job.company_name,
        location: job.location || 'Remote',
        url: job.url,
        source: 'Arbeitnow',
        description: (job.description || '').replace(/<[^>]*>?/gm, '').substring(0, 300), // Clean text excerpt
        salary: 'Competitive',
        postedAt: job.created_at ? new Date(job.created_at * 1000).toLocaleDateString() : 'Recent'
      }));
  } catch (error) {
    console.error('Error fetching Arbeitnow:', error.message);
    return [];
  }
}

module.exports = { fetchArbeitnow };
