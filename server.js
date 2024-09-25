const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid"); // Import UUID for unique IDs

const app = express();
const port = 3000;

const regex =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)/i;

// Use CORS middleware to allow cross-origin requests
app.use(cors());
app.use(express.json());

// Set up multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueID = uuidv4(); // Generate a unique ID for the file
    const extension = path.extname(file.originalname);
    const originalName = path.basename(file.originalname, extension);
    cb(null, `${uniqueID}-${originalName}${extension}`); // Include UUID in the filename
  },
});

// Create the multer instance
const upload = multer({ storage: storage });

// Set up a route for file uploads
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ message: "File uploaded successfully!" });
});

app.get("/files", (req, res) => {
  const directoryPath = path.join(__dirname, "uploads");

  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const page = parseInt(req.query.page, 10) || 0;
  const sortField = req.query.sortField || "dateUploaded";
  const sortOrder = req.query.sortOrder || "asc";

  // Read the files from the directory
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return res.status(500).json({
        message: "Unable to scan files!",
      });
    }

    // Create an array of file details with unique ID and creation date
    let fileList = files.map((file) => {
      const filePath = path.join(directoryPath, file);
      const stats = fs.statSync(filePath);

      const match = file.match(regex);

      const id = match ? match[1] : null;
      const extractedFileName = match ? match[2].trim() : file;

      return {
        id,
        filename: extractedFileName,
        size: stats.size,
        dateUploaded: stats.birthtime.toISOString(),
      };
    });

    // Apply sorting based on the requested sortField and sortOrder
    fileList = fileList.sort((a, b) => {
      const valueA = a[sortField];
      const valueB = b[sortField];

      if (sortOrder === "asc") {
        return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      } else {
        return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
      }
    });

    const totalFilesCount = fileList.length;
    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedFiles = fileList.slice(startIndex, endIndex);

    res.json({ totalFilesCount, files: paginatedFiles });
  });
});

app.delete("/files", (req, res) => {
  const fileIds = req.body.fileIds; // Expecting an array of file IDs
  const directoryPath = path.join(__dirname, "uploads");

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ message: "Invalid file IDs." });
  }

  // List files to find the correct ones to delete
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return res.status(500).json({
        message: "Unable to scan files!",
      });
    }

    const filesToDelete = fileIds
      .map((fileId) => {
        return files.find((file) => {
          const match = file.match(regex);
          return match && match[1] === fileId; // Compare the UUIDs
        });
      })
      .filter(Boolean); // Remove undefined values if no match is found

    if (filesToDelete.length === 0) {
      return res.status(404).json({ message: "No files found." });
    }

    let deletionCount = 0;

    // Delete the matched files
    filesToDelete.forEach((fileToDelete) => {
      const filePath = path.join(directoryPath, fileToDelete);
      fs.unlink(filePath, (err) => {
        if (err) {
          return res.status(500).json({
            message: `Unable to delete file: ${fileToDelete}.`,
          });
        }

        deletionCount++;
        if (deletionCount === filesToDelete.length) {
          res.json({
            message: `${deletionCount} file(s) deleted successfully.`,
          });
        }
      });
    });
  });
});

app.get("/files/:id", (req, res) => {
  const fileId = req.params.id;
  const directoryPath = path.join(__dirname, "uploads");

  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return res.status(500).json({ message: "Unable to scan files!" });
    }

    const file = files.find((file) => {
      const match = file.match(regex);
      return match && match[1] === fileId;
    });
    if (!file) {
      return res.status(404).json({ message: "File not found!" });
    }

    const match = file.match(regex);
    const originalFilename = match ? match[2].trim() : file;

    // Serve the file with the correct filename in the Content-Disposition header
    const filePath = path.join(directoryPath, file);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${originalFilename}"`
    );
    res.sendFile(filePath);
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
