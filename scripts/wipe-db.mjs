import { MongoClient } from 'mongodb';

const URI = 'mongodb+srv://jijiwishasociety:jijiwishasociety%402018@poshcompass.lamkopq.mongodb.net/POSH_COMPASS';

async function wipeDatabase() {
  console.log('Connecting to MongoDB Atlas...');
  const client = new MongoClient(URI);
  
  try {
    await client.connect();
    const db = client.db('POSH_COMPASS');
    
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections:`, collections.map(c => c.name).join(', '));
    
    if (collections.length === 0) {
      console.log('Database is already empty.');
      return;
    }
    
    for (const col of collections) {
      await db.collection(col.name).drop();
      console.log('  Dropped: ' + col.name);
    }
    
    console.log('\nAll collections dropped. Database is clean.');
  } finally {
    await client.close();
  }
}

wipeDatabase().catch(console.error);
