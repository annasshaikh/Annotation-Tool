import json
import cv2
import numpy as np
import os

def annotate_images(json_filepath):
    # 1. Load the JSON data
    with open(json_filepath, 'r') as f:
        data = json.load(f)

    # 2. Loop through each image in the project
    for img_data in data['images']:
        image_name = img_data['image_name']
        
        # Check if the image exists in the current directory
        if not os.path.exists(image_name):
            print(f"Error: Image '{image_name}' not found. Make sure it is in the same directory.")
            continue

        # 3. Read the image
        # Using IMREAD_UNCHANGED to preserve original data (useful for scientific .tif files)
        img = cv2.imread(image_name, cv2.IMREAD_UNCHANGED)
        
        # 4. Handle scientific TIFFs (often 16-bit or single-channel grayscale)
        # Convert 16-bit to 8-bit so colors render correctly when saving
        if img.dtype == np.uint16:
            img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
            
        # Convert grayscale to BGR color space so we can draw colored lines
        if len(img.shape) == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

        # 5. Process each annotation
        for ann in img_data['annotations']:
            ann_type = ann['annotationType']
            points = ann['coordinates']['points']
            label = ann['label']

            # Convert points to a numpy array of shape (N, 1, 2) as required by OpenCV
            pts = np.array(points, dtype=np.int32).reshape((-1, 1, 2))

            # Determine color based on annotation type (Colors are in BGR format)
            if ann_type == "cell_wall":
                color = (0, 255, 0)  # Green for cell wall
            elif ann_type == "nucleus_wall":
                color = (255, 0, 0)  # Blue for nucleus wall
            else:
                color = (0, 0, 255)  # Red for any other type

            # Draw the trace as a connected polygon
            # isClosed=True connects the last point back to the first point
            cv2.polylines(img, [pts], isClosed=True, color=color, thickness=2)

            # Add the text label slightly above the first coordinate
            first_point = tuple(pts[0][0])
            text_position = (first_point[0], first_point[1] - 10)
            cv2.putText(img, label, text_position, cv2.FONT_HERSHEY_SIMPLEX, 
                        0.5, color, 1, cv2.LINE_AA)

        # 6. Save the annotated image
        output_name = f"annotated_{image_name}"
        cv2.imwrite(output_name, img)
        print(f"Successfully annotated and saved: {output_name}")

if __name__ == "__main__":
    # Ensure this matches the name of your saved JSON file
    annotate_images('cell.json')