const express = require('express')
const multer = require('multer')
const csvParser = require('csv-parser')
const fs = require('fs')
const processCSV = require('./index2')
const app = express()
const port = 3000

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/') // Set the destination folder
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + '-' + uniqueSuffix + '.csv') // Set the file name
  },
})

const upload = multer({ storage })

app.post('/upload', upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('Please upload a CSV file.')
  }

  const csvData = []
  const newPath = `uploads/${req.file.originalname}`

  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on('data', (row) => {
      csvData.push(row)
    })
    .on('end', () => {
      // Save the CSV file locally
      fs.rename(req.file.path, newPath, (err) => {
        if (err) {
          console.error(err)
          return res.status(500).send('Internal Server Error')
        }
        console.log(
          `CSV Data from ${req.file.originalname} saved at ${newPath}`
        )
        console.log('File uploaded, processed, and saved locally.')

        // Send a response once the file is processed
        res.send('File uploaded, processed, and saved locally.')
      })
    })
})

app.get('/data', (req, res) => {
  try {
    const result = processCSV('uploads/Rolex Watches Database - Main Table.csv')
    res.json({ data: result })
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
