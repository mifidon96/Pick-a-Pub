To create and link this database to a Next.js application, you can follow these steps:

1. Choose a Database Hosting Solution
You need a database server to host your SQL database. Some popular choices include:

Amazon RDS: A scalable and managed relational database service by AWS.
Heroku Postgres: A managed SQL database service provided by Heroku.
DigitalOcean Managed Databases: Offers managed databases for various engines.
Supabase: A backend-as-a-service platform that provides a Postgres database.
PlanetScale: A managed database service built on MySQL.
For simplicity, let's use Supabase, which is easy to set up and integrates well with Next.js.

2. Set Up Supabase
Sign Up and Create a Project
Go to Supabase.
Sign up and create a new project.
Note the connection details (host, port, database name, username, and password).
Create the Database Schema
Go to the SQL editor in the Supabase dashboard.
Execute the SQL statements to create the tables:
sql
Copy code
-- Create Pubs Table
CREATE TABLE Pubs (
    pub_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    phone_number VARCHAR(20)
);

-- Create Ratings Table
CREATE TABLE Ratings (
    rating_id SERIAL PRIMARY KEY,
    pub_id INT REFERENCES Pubs(pub_id),
    cosy_lively_scale INT CHECK (cosy_lively_scale BETWEEN 1 AND 10),
    can_watch_sports BOOLEAN,
    date_night_rating INT CHECK (date_night_rating BETWEEN 1 AND 10)
);
3. Set Up Next.js with Supabase
Install Dependencies
In your Next.js project, install the necessary dependencies:

bash
Copy code
npm install @supabase/supabase-js
Configure Supabase Client
Create a file lib/supabaseClient.js in your Next.js project to initialize the Supabase client:

javascript
Copy code
import { createClient } from '@supabase/supabase-js';

// Replace with your actual Supabase project URL and anon key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
Make sure to add your Supabase URL and anon key to your environment variables. Create a .env.local file in the root of your project:

bash
Copy code
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
Fetch Data from Supabase
You can now fetch data from Supabase in your Next.js pages or components. Here's an example in pages/index.js:

javascript
Copy code
import { supabase } from '../lib/supabaseClient';

export default function Home({ pubs }) {
  return (
    <div>
      <h1>Pubs</h1>
      <ul>
        {pubs.map((pub) => (
          <li key={pub.pub_id}>
            <h2>{pub.name}</h2>
            <p>{pub.address}</p>
            <p>{pub.phone_number}</p>
            <p>Cosy-Lively Scale: {pub.cosy_lively_scale}</p>
            <p>Can Watch Sports: {pub.can_watch_sports ? 'Yes' : 'No'}</p>
            <p>Date Night Rating: {pub.date_night_rating}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function getServerSideProps() {
  const { data: pubs, error } = await supabase
    .from('Pubs')
    .select(`
      pub_id, 
      name, 
      address, 
      phone_number, 
      Ratings (
        cosy_lively_scale, 
        can_watch_sports, 
        date_night_rating
      )
    `);

  if (error) {
    console.log('Error fetching data: ', error);
    return { props: { pubs: [] } };
  }

  // Flatten the data to merge Pubs and Ratings
  const formattedPubs = pubs.map(pub => ({
    ...pub,
    ...pub.Ratings[0]
  }));

  return { props: { pubs: formattedPubs } };
}
4. Run Your Next.js Application
Start your Next.js application:

bash
Copy code
npm run dev
Visit http://localhost:3000 to see the list of pubs fetched from your Supabase database.

Additional Notes
Ensure your database tables and columns match the SQL schema defined.
Adjust the data fetching and rendering logic based on your exact requirements and database structure.
Secure your environment variables and never expose sensitive information in the client-side code.
This setup provides a basic integration of a Supabase SQL database with a Next.js application, enabling you to store and retrieve data as needed.
