#!/bin/bash
# Script to download all stored images from Medplum Docker container

echo "📥 Downloading all stored images from Medplum..."

# Create output directory
mkdir -p downloaded-images

# Get list of all binary directories
BINARY_DIRS=$(docker-compose -f docker-compose.dev.yml exec -T medplum-server ls /app/packages/server/binary/)

# Counter
COUNT=0

# Loop through each directory
for DIR in $BINARY_DIRS; do
  # Remove any carriage returns or whitespace
  DIR=$(echo $DIR | tr -d '\r\n ')
  
  if [ ! -z "$DIR" ]; then
    echo "Processing directory: $DIR"
    
    # Get files in this directory
    FILES=$(docker-compose -f docker-compose.dev.yml exec -T medplum-server ls /app/packages/server/binary/$DIR/)
    
    for FILE in $FILES; do
      FILE=$(echo $FILE | tr -d '\r\n ')
      
      if [ ! -z "$FILE" ]; then
        # Copy file from container
        docker cp medplum-server:/app/packages/server/binary/$DIR/$FILE ./downloaded-images/image-${COUNT}.bin
        
        echo "✅ Downloaded: image-${COUNT}.bin (from $DIR/$FILE)"
        COUNT=$((COUNT + 1))
      fi
    done
  fi
done

echo ""
echo "🎉 Downloaded $COUNT images to ./downloaded-images/"
echo "💡 Tip: Rename .bin files to .png or .jpg to view them"
