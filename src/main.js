const { Actor } = require('apify');
const axios = require('axios');
const cheerio = require('cheerio');

Actor.main(async () => {
  const input = await Actor.getInput();
  const { keywords, maxItems = 30 } = input;
  
  console.log('Starting Walmart scraper...');
  console.log('Keywords:', keywords);
  console.log('Max items:', maxItems);
  
  const results = [];
  const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL']
  });
  
  for (const keyword of keywords) {
    if (results.length >= maxItems) break;
    
    try {
      const searchUrl = `https://www.walmart.com/search?q=${encodeURIComponent(keyword)}`;
      
      const response = await axios.get(searchUrl, {
        proxy: proxyConfiguration.createProxyUrl(),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Try to find JSON data in script tags
      let items = [];
      const scripts = $('script').toArray();
      for (const script of scripts) {
        const text = $(script).html() || '';
        if (text.includes('__INITIAL_STATE__') || text.includes('initialData')) {
          try {
            const match = text.match(/window.__INITIAL_STATE__s*=s*({.+?});/);
            if (match) {
              const data = JSON.parse(match[1]);
              items = data.search?.searchResults?.results || 
                     data.searchResult?.itemStacks?.[0]?.items || [];
              break;
            }
          } catch (e) {}
        }
      }
      
      // Fallback to HTML parsing
      if (items.length === 0) {
        $('[data-automation-id="product-title"]').each((i, el) => {
          const container = $(el).closest('[data-item-id]');
          const itemId = container.attr('data-item-id') || '';
          
          items.push({
            id: itemId,
            name: $(el).text().trim(),
            price: container.find('[data-automation-id="product-price"]').text().trim() || 
                   container.find('.price-current').text().trim() || '',
            rating: container.find('[data-automation-id="product-rating"]').text().trim() || '',
            imageUrl: container.find('img').attr('src') || ''
          });
        });
      }
      
      for (const item of items) {
        if (results.length >= maxItems) break;
        
        results.push({
          title: item.name || item.title || '',
          price: item.price || item.priceInfo?.priceString || '',
          rating: parseFloat(item.rating?.averageRating) || 0,
          reviewCount: parseInt(item.numReviews) || 0,
          imageUrl: item.imageUrl || item.imageInfo?.[0]?.url || '',
          productUrl: item.id ? `https://www.walmart.com/ip/${item.id}` : '',
          brand: item.brand || '',
          sponsored: item.isSponsored || false,
          keyword
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Error scraping keyword "${keyword}":`, error.message);
    }
  }
  
  await Actor.pushData(results);
  console.log('Scraping completed. Total results:', results.length);
});