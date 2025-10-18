import { Document } from "@langchain/core/documents";
import { getVectorStore } from './vectorStore';
import User from '../models/user.tsx';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { getDb } from './mongoClient';

// Text chunker - same as devhacks implementation
const chunkText = (text: string, chunkSize: number = 100): string[] => {
  const tokens = text.split(/\s+/); // Simple tokenization
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += chunkSize) {
    chunks.push(tokens.slice(i, i + chunkSize).join(' '));
  }
  return chunks;
};

// Parse resume and extract metadata - simplified version of devhacks
const parseResume = async (buffer: Buffer) => {
  let text = await pdf(buffer, {
    max: 1, // Limit to first page for performance
  }).then(data => data.text);

  // Clean up the text
  text = text.replace(/(\r\n|\n|\r)/gm, " "); // Remove newlines for better processing
  text = text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
  text = text.replace(/[^a-zA-Z0-9\s.,;:!?@#&()/\-]/g, ' '); // Remove special characters except common punctuation
  
  // Extract basic metadata (simplified version)
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  const phoneMatch = text.match(/(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/);
  const urlMatch = text.match(/https?:\/\/[^\s]+/g);
  
  // Extract proper nouns as tags (simplified)
  const words = text.split(/\s+/);
  const properNouns = words.filter(word => 
    word.length > 2 && 
    /^[A-Z]/.test(word) && 
    !/^(THE|AND|OR|BUT|IN|ON|AT|TO|FOR|OF|WITH|BY|FROM|UP|ABOUT|INTO|THROUGH|DURING|BEFORE|AFTER|ABOVE|BELOW|BETWEEN|AMONG|UNDER|OVER|WITHIN|WITHOUT|AGAINST|UPON|ACROSS|BEHIND|BESIDE|BESIDES|BEYOND|INSIDE|OUTSIDE|UNDERNEATH|THROUGHOUT|WHEREAS|WHENEVER|WHEREVER|WHICHEVER|WHOEVER|WHATEVER|HOWEVER|THEREFORE|MOREOVER|FURTHERMORE|NEVERTHELESS|NONETHELESS|OTHERWISE|MEANWHILE|FURTHERMORE|ADDITIONALLY|CONSEQUENTLY|ACCORDINGLY)$/i.test(word)
  );
  
  const tags = Array.from(new Set(properNouns.map(tag => tag.toLowerCase())));

  const metadata = {
    contact_number: phoneMatch ? phoneMatch[0] : null,
    email: emailMatch ? emailMatch[0] : null,
    socials: urlMatch || [],
    tags: tags,
  };

  return {
    content: text,
    metadata: metadata
  };
};

/**
 * Process and upsert resume for a user
 * 
 * @param buffer - PDF buffer
 * @param userId - User ObjectId as string
 * @param userMajor - Fallback major (deprecated, will fetch from Application)
 */
export const upsertResume = async (buffer: Buffer, userId: string, userMajor: string) => {
  try {
    const resumeDoc = await parseResume(buffer);
    const chunks = chunkText(resumeDoc.content);

    // Fetch major from Application collection by user ID
    let actualMajor = userMajor;
    try {
      const user = await User.findById(userId);
      if (user) {
        // Import Application model dynamically to avoid circular dependencies
        const { Application } = await import('./mongodb');
        if (Application) {
          // Look up application by user ID (new schema)
          const application = await Application.findOne({ user: userId });
          if (application && application.major) {
            actualMajor = application.major;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching application data for major:', error);
      // Use the provided major as fallback
    }

    // Delete old embeddings for this user before inserting new ones
    // This prevents duplicate key errors and keeps the embeddings collection clean
    try {
      const db = await getDb();
      const collectionName = process.env.MONGO_DB_COLLECTION || 'embeddings';
      const collection = db.collection(collectionName);

      // Delete all existing embeddings for this user
      const deleteResult = await collection.deleteMany({ 'metadata.user_id': userId });
      console.log(`Deleted ${deleteResult.deletedCount} existing embeddings for user ${userId}`);
    } catch (deleteError) {
      console.error('Error deleting old embeddings:', deleteError);
      // Continue even if deletion fails - this is a cleanup step
    }

  let metadata: any = resumeDoc.metadata;
    metadata.user_id = userId;
    metadata.major = actualMajor || "Not specified";

    // Create Document objects for each chunk with unique metadata
    // Add chunk_index and timestamp to ensure uniqueness and prevent duplicate key errors
    const documents = chunks
      .filter(chunk => chunk.trim() !== '' && chunk.length > 50) // Ensure chunk is not empty and has sufficient length
      .map((chunk, index) => new Document({
        pageContent: chunk,
        metadata: {
          ...metadata,
          chunk_index: index, // Add chunk index for uniqueness within a resume
          upload_timestamp: new Date().toISOString() // Add timestamp to track when embeddings were created
        }
      }));

    // Get vector store and add documents
    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments(documents);

    console.log(`Successfully processed ${documents.length} chunks for user ${userId} with major: ${actualMajor}`);
    return documents;
  } catch (error) {
    console.error('Error processing resume:', error);
    throw error;
  }
};
