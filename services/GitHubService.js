const { Octokit } = require('@octokit/rest');
const fs = require('fs-extra');
const path = require('path');

class GitHubService {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
    
    this.owner = process.env.GITHUB_REPO_OWNER;
    this.repo = process.env.GITHUB_REPO_NAME;
    this.branch = process.env.GITHUB_BRANCH || 'main';
  }

  async createIssue(title, body, labels = []) {
    try {
      const response = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: title,
        body: body,
        labels: labels
      });
      
      console.log(`Issue created: ${response.data.html_url}`);
      return response.data;
    } catch (error) {
      console.error('Error creating GitHub issue:', error);
      throw error;
    }
  }

  async createVideoProcessingIssue(videoInfo, results) {
    const issueBody = `
## Video Processing Completed ✅

**Video Details:**
- **Original Name:** ${videoInfo.originalName}
- **Video ID:** ${videoInfo.id}
- **Size:** ${this.formatFileSize(videoInfo.size)}
- **Upload Time:** ${new Date(videoInfo.timestamp).toLocaleString()}

**Processing Results:**
${results.videoUrl ? `- **Main Video URL:** ${results.videoUrl}` : ''}
${results.thumbnailUrl ? `- **Thumbnail URL:** ${results.thumbnailUrl}` : ''}
${results.videoParts && results.videoParts.length > 0 ? `- **Video Parts:** ${results.videoParts.length} parts` : ''}

**Video Parts:**
${results.videoParts ? results.videoParts.map((url, index) => `- Part ${index + 1}: ${url}`).join('\n') : 'No parts generated'}

---
*This issue was automatically created by the video processing system.*
    `;

    return await this.createIssue(
      `Video Processing: ${videoInfo.originalName}`,
      issueBody,
      ['video-processing', 'automated', 'completed']
    );
  }

  async createErrorIssue(videoInfo, error) {
    const issueBody = `
## Video Processing Error ❌

**Video Details:**
- **Original Name:** ${videoInfo.originalName}
- **Video ID:** ${videoInfo.id}
- **Size:** ${this.formatFileSize(videoInfo.size)}
- **Upload Time:** ${new Date(videoInfo.timestamp).toLocaleString()}

**Error Details:**
\`\`\`
${error.message || error}
\`\`\`

**Error Stack:**
\`\`\`
${error.stack || 'No stack trace available'}
\`\`\`

---
*This issue was automatically created by the video processing system.*
    `;

    return await this.createIssue(
      `Video Processing Error: ${videoInfo.originalName}`,
      issueBody,
      ['video-processing', 'automated', 'error']
    );
  }

  async commitResults(results, videoInfo) {
    try {
      // Create results directory if it doesn't exist
      await fs.ensureDir('results');
      
      // Save results to file
      const resultsFile = path.join('results', `video-${videoInfo.id}-results.json`);
      await fs.writeJson(resultsFile, {
        videoInfo,
        results,
        timestamp: new Date().toISOString()
      }, { spaces: 2 });

      // Create commit
      const commitMessage = `Add video processing results for ${videoInfo.originalName}`;
      const repoPath = `results/video-${videoInfo.id}-results.json`;

      // Read the file content
      const fileContent = await fs.readFile(resultsFile, 'utf8');

      // Determine if file exists to include sha for updates
      let sha = undefined;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: repoPath,
          ref: this.branch
        });
        if (data && data.sha) sha = data.sha;
      } catch (e) {
        // 404 means file does not exist; proceed without sha
      }

      // Create or update file in repository
      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: repoPath,
        message: commitMessage,
        content: Buffer.from(fileContent).toString('base64'),
        branch: this.branch,
        ...(sha ? { sha } : {})
      });

      console.log(`Results committed to GitHub for video ${videoInfo.id}`);
      return true;
    } catch (error) {
      console.error('Error committing results to GitHub:', error);
      throw error;
    }
  }

  async getRepositoryInfo() {
    try {
      const response = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo
      });
      
      return {
        name: response.data.name,
        fullName: response.data.full_name,
        description: response.data.description,
        url: response.data.html_url,
        defaultBranch: response.data.default_branch,
        size: response.data.size,
        language: response.data.language
      };
    } catch (error) {
      console.error('Error getting repository info:', error);
      throw error;
    }
  }

  async listIssues(state = 'open') {
    try {
      const response = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: state,
        per_page: 100
      });
      
      return response.data;
    } catch (error) {
      console.error('Error listing issues:', error);
      throw error;
    }
  }

  async closeIssue(issueNumber) {
    try {
      const response = await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed'
      });
      
      console.log(`Issue ${issueNumber} closed`);
      return response.data;
    } catch (error) {
      console.error('Error closing issue:', error);
      throw error;
    }
  }

  async addCommentToIssue(issueNumber, comment) {
    try {
      const response = await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: comment
      });
      
      console.log(`Comment added to issue ${issueNumber}`);
      return response.data;
    } catch (error) {
      console.error('Error adding comment to issue:', error);
      throw error;
    }
  }

  async getFileContent(filePath) {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: filePath
      });
      
      if (response.data.type === 'file') {
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return content;
      }
      
      throw new Error('Path is not a file');
    } catch (error) {
      console.error('Error getting file content:', error);
      throw error;
    }
  }

  async updateFile(filePath, message, content, sha) {
    try {
      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: filePath,
        message: message,
        content: Buffer.from(content).toString('base64'),
        branch: this.branch,
        ...(sha ? { sha } : {})
      });
      
      console.log(`File ${filePath} updated`);
      return response.data;
    } catch (error) {
      console.error('Error updating file:', error);
      throw error;
    }
  }

  // Trigger GitHub Actions workflow_dispatch with inputs
  async triggerWorkflowDispatch(workflowFileName, inputs) {
    try {
      await this.octokit.actions.createWorkflowDispatch({
        owner: this.owner,
        repo: this.repo,
        workflow_id: workflowFileName,
        ref: this.branch,
        inputs
      });
      console.log(`Workflow ${workflowFileName} dispatched with inputs:`, inputs);
      return true;
    } catch (error) {
      console.error('Error triggering workflow dispatch:', error);
      throw error;
    }
  }

  // Create or update a file using a local path into the repository (e.g., uploads/ folder)
  async commitLocalFileToRepo(localFilePath, repoPath, commitMessage) {
    try {
      const contentBuffer = await fs.readFile(localFilePath);
      let sha = undefined;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: repoPath,
          ref: this.branch
        });
        if (data && data.sha) sha = data.sha;
      } catch (e) {
        // File does not exist yet
      }

      const response = await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: repoPath,
        message: commitMessage,
        content: contentBuffer.toString('base64'),
        branch: this.branch,
        ...(sha ? { sha } : {})
      });

      return response.data;
    } catch (error) {
      console.error('Error committing local file to repo:', error);
      throw error;
    }
  }

  // Try to fetch a JSON results file committed by the pipeline
  async tryGetResultsById(videoId) {
    const candidatePaths = [
      `results/video-${videoId}-results.json`,
      `results/${videoId}.json`
    ];

    for (const p of candidatePaths) {
      try {
        const content = await this.getFileContent(p);
        if (content) {
          return { path: p, json: JSON.parse(content) };
        }
      } catch (e) {
        // continue
      }
    }
    return null;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Test GitHub connection
  async testConnection() {
    try {
      const repoInfo = await this.getRepositoryInfo();
      console.log('✅ GitHub connection successful');
      console.log(`Repository: ${repoInfo.fullName}`);
      console.log(`Description: ${repoInfo.description}`);
      console.log(`URL: ${repoInfo.url}`);
      return true;
    } catch (error) {
      console.error('❌ GitHub connection failed:', error.message);
      return false;
    }
  }
}

module.exports = GitHubService;
