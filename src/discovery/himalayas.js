const axios = require('axios');

async function fetchHimalayas(keywords = ['engineer', 'developer']) {
  try {
    const res = await axios.get('https://himalayas.app/jobs/api', {
      params: { category: 'developer' },
      timeout: 10000
    });
    
    if (!res.data || !res.data.jobs) return [];

    return res.data.jobs
      .filter(job => {
        const title = (job.title || '').toLowerCase();
        return keywords.some(kw => title.includes(kw));
      })
      .map(job => ({
        title: job.title,
        company: job.companyName || 'Himalayas Partner',
        location: (job.locationRestrictions && job.locationRestrictions.length > 0)
          ? job.locationRestrictions.join(', ')
          : 'Remote',
        url: job.applicationLink || job.guid,
        source: 'Himalayas',
        description: job.excerpt || '',
        salary: job.minSalary && job.maxSalary ? `$${job.minSalary.toLocaleString()} - $${job.maxSalary.toLocaleString()}` : 'Competitive',
        postedAt: job.pubDate ? new Date(job.pubDate * 1000).toLocaleDateString() : 'Recent'
      }));
  } catch (error) {
    console.error('Error fetching Himalayas:', error.message);
    return [];
  }
}

module.exports = { fetchHimalayas };
