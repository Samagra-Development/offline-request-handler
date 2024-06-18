import localForage from 'localforage';
import { API_REQUESTS_STORAGE_KEY } from './constants';



// Function to generate UUID for requests
export const generateUuid = function() {
  return String(Date.now().toString(32) + Math.random().toString(16)).replace(
    /\./g,
    ''
  );
};


export const getStoredRequests = async () => {
  try {
    return await localForage.getItem(API_REQUESTS_STORAGE_KEY);
  } catch (error) {
    console.error('Error getting stored API requests:', error);
    return [];
  }
};

export const setStorage =async (data:any)=>{
  try {
    await localForage.setItem(API_REQUESTS_STORAGE_KEY,data);
  } catch (error) {
    console.error('Error setting store :', error);
  }
}
export const clearStoredRequests = async () => {
  try {
    await localForage.removeItem(API_REQUESTS_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing stored API requests:', error);
  }
};

export  function formDataToObject(formData:any) {
  let object:any = {};
  formData.forEach((value:any, key:string) => {
    if (object.hasOwnProperty(key)) {
      if (!Array.isArray(object[key])) {
        object[key] = [object[key]];
      }
      object[key].push(value);
    } else {
      object[key] = value;
    }
  });
  return object;
}


export function _formDataToObject(formData:any) {
  return new Promise((resolve, reject) => {
    try {
      let object = {};
      formData.forEach((value:any, key:any) => {
        if (Object.hasOwnProperty.call(object, key)) {
          //@ts-ignore
          if (!Array.isArray(object[key])) {
             //@ts-ignore
            object[key] = [object[key]];
          }
           //@ts-ignore
          object[key].push(value);
        } else {
           //@ts-ignore
          object[key] = value;
        }
      });
      resolve(object);
    } catch (error) {
      reject(error);
    }
  });
}

export function objectToFormData(obj:any) {
  const formData = new FormData();

  for (const key in obj) {
    if (Object.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      if (Array.isArray(value)) {
        value.forEach((item) => formData.append(key, item));
      } else {
        formData.append(key, value);
      }
    }
  }
  formData.forEach((value,key) => {
    console.log("formdata",key+" "+value)
  });
  return formData;
}