const AWS = require('aws-sdk')
const {
  mergeAudioFiles,
} = require('./audioAppointmentUtils')

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-west-2', // e.g., 'us-west-1'
})
const s3 = new AWS.S3()
const bucketName = process.env.S3_BUCKET_NAME

function getSignedUrl(bucketName, objectKey) {
  const params = {
    Bucket: bucketName,
    Key: objectKey,
    Expires: 900, // This sets the expiration time to 15 minutes (900 seconds)
  }

  return s3.getSignedUrl('getObject', params)
}

function getFileFromS3(key) {
  return new Promise((resolve, reject) => {
    // Extract bucket name and key from the S3 URL

    const params = {
      Bucket: bucketName,
      Key: key,
    }

    // Get the object from S3
    s3.getObject(params, (err, data) => {
      if (err) {
        console.error('Error getting object from S3:', err)
        reject(err)
      } else {
        // Create a file-like object
        const fileObject = {
          fieldname: 'file', // Field name in the form
          originalname: key.split('/').pop(), // Original file name extracted from the key
          encoding: '7bit',
          mimetype: data.ContentType,
          size: data.ContentLength,
          buffer: data.Body, // Buffer containing file content
        }
        resolve(fileObject)
      }
    })
  })
}

async function uploadBufferToS3(buffer, bucketName, key) {
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: 'audio/mp4', // Set the appropriate content type for your audio file
  }

  try {
    await s3.upload(params).promise()
    console.log('Successfully uploaded buffer to S3 with key:', key)
    return key // Return just the key of the uploaded object
  } catch (error) {
    console.error('Error uploading buffer to S3:', error)
    throw error
  }
}

async function getPresignedUrl(Bucket, Key) {
  return s3.getSignedUrl('getObject', {
    Bucket,
    Key,
    Expires: 60 * 5,
  })
}

// async function generateAppointmentPreSignedUrls(appointmentId, isMultiMembers=false) {
//   const params = {
//     Bucket: bucketName,
//     Prefix: `appointments/${appointmentId}/`,
//   }

//   try {
//     const objects = await s3.listObjectsV2(params).promise()
//     const urls = objects.Contents.map(object => {
//       const url = s3.getSignedUrl('getObject', {
//         Bucket: bucketName,
//         Key: object.Key,
//         Expires: 60 * 20,
//       })
//       return { key: object.Key, url: url }
//     })

//     // URLs are in the same order as the objects were listed, which can be sorted by key
//     return urls
//   } catch (error) {
//     console.error('Error generating pre-signed URLs:', error)
//     throw error
//   }
// }

async function deleteFiles(bucket, keys) {
  const params = {
    Bucket: bucket,
    Delete: { Objects: keys.map(key => ({ Key: key })) },
  }
  await s3.deleteObjects(params).promise()
}

async function generateAppointmentPreSignedUrls(
  appointmentId,
  isMultiMembers = false
) {
  const params = {
    Bucket: bucketName,
    Prefix: `appointments/${appointmentId}/`,
  }

  try {
    const objects = await s3.listObjectsV2(params).promise()
    const audioFiles = objects.Contents.filter(obj => obj.Key.endsWith('.m4a'))

    if (isMultiMembers && audioFiles.length > 1) {
      const buffers = await Promise.all(
        audioFiles.map(file => downloadFile(bucketName, file.Key))
      )
      let mergedBuffer = buffers[0]

      for (let i = 1; i < buffers.length; i++) {
        mergedBuffer = await mergeAudioFiles(mergedBuffer, buffers[i])
      }

      const newKey = `appointments/${appointmentId}/mergedAudio-${new Date(
        Date.now()
      )}.m4a`
      await deleteFiles(
        bucketName,
        audioFiles.map(file => file.Key)
      )
      await uploadFile(bucketName, newKey, mergedBuffer)

      const url = s3.getSignedUrl('getObject', {
        Bucket: bucketName,
        Key: newKey,
        Expires: 60 * 20,
      })

      return [{ key: newKey, url: url }]
    } else {
      // Return URLs for individual files or a single file
      return audioFiles.map(file => {
        const url = s3.getSignedUrl('getObject', {
          Bucket: bucketName,
          Key: file.Key,
          Expires: 60 * 20,
        })
        return { key: file.Key, url: url }
      })
    }
  } catch (error) {
    console.error('Error processing audio files:', error)
    throw error
  }
}

async function downloadFile(bucket, key) {
  const params = {
    Bucket: bucket,
    Key: key,
  }
  const data = await s3.getObject(params).promise()
  return data.Body
}

async function uploadFile(bucket, key, body) {
  const params = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'audio/mp3',
  }
  await s3.upload(params).promise()
}

module.exports = {
  getSignedUrl,
  getFileFromS3,
  uploadBufferToS3,
  getPresignedUrl,
  generateAppointmentPreSignedUrls,
}
