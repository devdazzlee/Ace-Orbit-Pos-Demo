import axios from 'axios';

async function main() {
  try {
    const res = await axios.get('http://localhost:9000/api/v1/stock', {
      params: { productId: 'ac947eaf-5cab-4ed4-b4f7-03942912cf3b' }
    });
    console.log('API Response:', JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.error('API Error:', e.response?.data || e.message);
  }
}

main();
