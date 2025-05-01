import React from 'react';
import Link from 'next/link';
import ImageCard from '../components/ImageCard';
import { db, initializeData } from '../lib/db';

const IndexPage = ({ posts = [] }) => (
  <div>
    <h1>Next.js with NeDB Demo</h1>
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

// 使用 getInitialProps 替代 getServerSideProps
IndexPage.getInitialProps = async () => {
  console.log('getInitialProps called'); // 调试日志
  try {
    await initializeData();
    const posts = await new Promise((resolve, reject) => {
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