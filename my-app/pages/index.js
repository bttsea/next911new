import React, { useState } from 'react';
import Link from 'next/link';
import ImageCard from '../components/ImageCard';
import { db, initializeData } from '../lib/db';

const IndexPage = ({ posts = [] }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = async (e) => {
   console.log('handleSubmit called');
   e.preventDefault();
   console.log('Title:', title);
   console.log('Content:', content);
 
   try {
     console.log('-------------------await fetch(/api/posts-----------------------------');
     const res = await fetch('/api/posts', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ title, content }),
     });
 
     console.log('Response status:', res.status);
     console.log('Response headers:', [...res.headers.entries()]);
 
     if (res.ok) {
       alert('Post created');
       window.location.reload();
     } else {
       const errText = await res.text();
       console.error('Error response:', errText);
       alert('Error creating post: ' + errText);
     }
   } catch (error) {
     console.error('Fetch Error:', error.message, error.stack);
     alert('Fetch failed: ' + error.message);
   }
 };

  return (
    <div>
      <h1>Next.js with NeDB Demo</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Content"
          required
        />
        <button type="submit">Create Post</button>
      </form>
      {posts.length > 0 ? (
        posts.map((post) => (
          <Link key={post._id} href={`/posts/${post._id}`}>
            <a>
              <ImageCard post={post} />
            </a>
          </Link>
        ))
      ) : (
        <p>No posts available.</p>
      )}
    </div>
  );
};

IndexPage.getInitialProps = async ({ req }) => {
  console.log('getInitialProps called, isServer:', !!req);
  try {
    await initializeData();
    const posts = await new Promise((resolve, reject) => {
      if (!db) {
        console.warn('Database not available');
        resolve([]);
        return;
      }
      db.find({}).sort({ createdAt: -1 }).exec((err, docs) => {
        if (err) {
          console.error('Error fetching posts:', err);
          reject(err);
        } else {
          console.log('Fetched posts:', docs);
          resolve(docs || []);
        }
      });
    });
    return { posts };
  } catch (error) {
    console.error('Error in getInitialProps:', error);
    return { posts: [] };
  }
};

export default IndexPage;