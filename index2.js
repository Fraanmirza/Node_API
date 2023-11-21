require('dotenv').config()
const fs = require('fs')
const csv = require('csv-parser')
const axios = require('axios')
const Papa = require('papaparse')

// Function to make API call with retries
async function makeAPICallWithRetry(
  url,
  maxRetries = 5,
  requestsPerMinute = 10
) {
  let retries = 0

  while (retries < maxRetries) {
    const startTime = Date.now()
    try {
      const response = await axios.get(url, {
        headers: {
          'x-api-key': process.env.API_KEY,
        },
      })
      return response
    } catch (error) {
      if (error.response && error.response.status === 429) {
        // Rate limit exceeded, wait for a while before retrying
        const retryAfter = error.response.headers['retry-after'] || 10
        console.log(
          `Rate limit exceeded. Retrying after ${retryAfter} seconds.`
        )
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
        retries++
      } else {
        // Other non-rate-limit-related errors
        console.error(`Error making API call: ${error.message}`)
        throw error
      }
    } finally {
      const elapsedTime = Date.now() - startTime
      const waitTime = Math.max(
        0,
        (60 * 1000) / requestsPerMinute - elapsedTime
      )
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }

  throw new Error(`Exceeded the maximum number of retries (${maxRetries}).`)
}

// Function to process CSV file and make API calls
async function processCSV(filePath) {
  try {
    const rows = []
    const uniqueReferenceNumbers = new Set()

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const referenceNumber = row['Reference Number']
        console.log('reading from csv , referenceNumber:', referenceNumber)
        // Check if the reference number is unique before processing
        if (!uniqueReferenceNumbers.has(referenceNumber)) {
          uniqueReferenceNumbers.add(referenceNumber)
          rows.push(row)
        }
      })
      .on('end', async () => {
        if (rows.length === 0) {
          console.log('No unique reference numbers found in the CSV file.')
          return
        }

        // Assume that brand name is the same for all reference numbers in the CSV
        const brandName = rows[0]['Brand']

        // Make the first API call to get brand_uuid
        const brandApiResponse = await makeAPICallWithRetry(
          `https://api.watchcharts.com/v2/search/brand?q=${brandName}`
        )
        const brandUuid = brandApiResponse.data.data[0].uuid
        console.log('Brand uuid :', brandUuid)

        // Make the second, third, and fourth API calls for each unique reference number
        const updatedRows = [] // Accumulate modified rows in memory
        for (const row of rows) {
          const referenceNumber = row['Reference Number']

          try {
            // Make the second API call using the obtained brand_uuid and reference_number
            const secondApiResponse = await makeAPICallWithRetry(
              `https://api.watchcharts.com/v2/search/watch?q=${referenceNumber}&brand_uuid=${brandUuid}`
            )

            // Extract watch_uuid from the second API response
            const watchUuid = secondApiResponse.data.data[0].uuid
            console.log('watch uuid:', watchUuid)
            // Make the third API call to get product info
            const thirdApiResponse = await makeAPICallWithRetry(
              `https://api.watchcharts.com/v2/watch/info?uuid=${watchUuid}`
            )

            // Make the fourth API call to get product specs
            const fourthApiResponse = await makeAPICallWithRetry(
              `https://api.watchcharts.com/v2/watch/specs?uuid=${watchUuid}`
            )
            // Make the fifth API call to get price history
            const fifthApiResponse = await makeAPICallWithRetry(
              `https://api.watchcharts.com/v2/watch/price_5y?uuid=${watchUuid}`
            )
            row['Product Info'] = thirdApiResponse
              ? JSON.stringify(thirdApiResponse.data, null, 2)
              : ''
            row['Product Specs'] = fourthApiResponse
              ? JSON.stringify(fourthApiResponse.data, null, 2)
              : ''
            row['Price History'] = fifthApiResponse
              ? JSON.stringify(fifthApiResponse.data, null, 2)
              : console.log(
                  `updating ${referenceNumber} with ${row['Product Info']}, ${row['Product Specs']} and ${row['Price History']} `
                )
            // Add the modified row to the accumulator
            updatedRows.push(row)
          } catch (error) {
            // Handle errors appropriately, e.g., log the error, skip the row, etc.
            console.error(
              `Error processing row for referenceNumber ${referenceNumber}: ${error.message}`
            )
            // Stop the entire process if the maximum number of retries is exceeded
            if (
              error.message.includes('Exceeded the maximum number of retries')
            ) {
              // Write accumulated data to the CSV before rethrowing the error
              if (updatedRows.length > 0) {
                const csvData = Papa.unparse(updatedRows, { header: true })
                fs.writeFileSync(filePath, csvData)
              }
              throw error
            }
          }
        }

        // Update the CSV file with the modified rows
        const csvData = Papa.unparse(rows, { header: true })
        fs.writeFileSync(filePath, csvData)

        // Process is complete, you can do something with the results
        console.log('API calls complete, CSV file updated')
      })
  } catch (error) {
    // Handle errors appropriately
    console.error(`Error processing CSV: ${error.message}`)
  }
}

// Replace 'your_csv_file.csv' with the path to your CSV file
//processCSV('Rolex Watches Database - Main Table.csv')
module.exports = processCSV
