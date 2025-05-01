import React from 'react';

const ImageCard = ({ post }) => {
  if (!post) {
    return <div>No post data</div>;
  }
  return (
    <div style={{ border: '1px solid #ddd', padding: '10px', margin: '10px' }}>
      <h2>{post.title || 'No title'}</h2>
      <p>{post.content || 'No content'}</p>
      <img src="/images/sample.jpg" alt="Sample" style={{ maxWidth: '300px' }} />
    </div>
  );
};

export default ImageCard;